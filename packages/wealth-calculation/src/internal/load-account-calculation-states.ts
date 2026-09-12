import {
  connectedAccountGroups,
  resolveCanonicalAccountId,
  type AccountCategory,
  type AccountPurpose,
  type AccountValuationCandidate,
  type ExternalAccountLifecycle,
} from "@monii/accounts";
import { getDatabase } from "@monii/postgres/client";
import {
  AccountMatchAssessment,
  AccountMerge,
  ExternalAccount,
} from "@monii/postgres/models";
import {
  accounts,
  accountValuationCandidates,
  institutions,
} from "@monii/postgres/schema";
import {
  synchronizationAccountResults,
  synchronizationRuns,
} from "@monii/postgres/schema";
import {
  accountPolicies,
} from "@monii/postgres/schema";
import { desc, eq, sql } from "drizzle-orm";

import type { AccountInclusionPolicy } from "../account-policy";
import type { AccountWealthCalculationState } from "../calculate-wealth-snapshot";

function laterCandidate(
  left: AccountValuationCandidate | null,
  right: AccountValuationCandidate,
) {
  if (!left) return right;
  const leftEffective = (left.effectiveAt ?? left.recordedAt).getTime();
  const rightEffective = (right.effectiveAt ?? right.recordedAt).getTime();
  return rightEffective > leftEffective ||
    (rightEffective === leftEffective &&
      right.recordedAt.getTime() > left.recordedAt.getTime())
    ? right
    : left;
}

export async function loadAccountCalculationStates(): Promise<
  readonly AccountWealthCalculationState[]
> {
  const db = getDatabase();
  const accountRows = await db
    .select({
      account: accounts,
      institutionName: institutions.name,
      policy: accountPolicies,
    })
    .from(accounts)
    .leftJoin(institutions, eq(accounts.institutionId, institutions.id))
    .leftJoin(accountPolicies, eq(accounts.id, accountPolicies.accountId));
  const merges = await AccountMerge.findMany();
  const groupedIds = new Map<string, string[]>();
  for (const row of accountRows) {
    const root = resolveCanonicalAccountId(row.account.id, merges);
    groupedIds.set(root, [...(groupedIds.get(root) ?? []), row.account.id]);
  }
  const externalRows = await ExternalAccount.findMany();
  const rankedValuations = db
    .select({
      accountId: accountValuationCandidates.accountId,
      amount: accountValuationCandidates.amount,
      candidateRank: sql<number>`row_number() over (
        partition by ${accountValuationCandidates.accountId}, ${accountValuationCandidates.valuationBasis}
        order by coalesce(${accountValuationCandidates.effectiveAt}, ${accountValuationCandidates.recordedAt}) desc,
          ${accountValuationCandidates.recordedAt} desc,
          ${accountValuationCandidates.id} desc
      )`.as("candidate_rank"),
      currency: accountValuationCandidates.currency,
      effectiveAt: accountValuationCandidates.effectiveAt,
      id: accountValuationCandidates.id,
      recordedAt: accountValuationCandidates.recordedAt,
      valuationBasis: accountValuationCandidates.valuationBasis,
    })
    .from(accountValuationCandidates)
    .as("ranked_account_valuations");
  const valuationRows = await db
    .select()
    .from(rankedValuations)
    .where(eq(rankedValuations.candidateRank, 1));
  const resultRows = await db
    .select({
      result: synchronizationAccountResults,
      runStartedAt: synchronizationRuns.startedAt,
    })
    .from(synchronizationAccountResults)
    .innerJoin(
      synchronizationRuns,
      eq(
        synchronizationRuns.id,
        synchronizationAccountResults.synchronizationRunId,
      ),
    )
    .orderBy(
      desc(synchronizationRuns.startedAt),
      desc(synchronizationAccountResults.finishedAt),
    );
  const matchRows = await AccountMatchAssessment.findMany({ isActive: true });
  const accountByExternal = new Map(
    externalRows.map((external) => [external.id, external.accountId]),
  );
  const likelyPairs = matchRows.flatMap((match) => {
    if (match.classification !== "likely_duplicate") return [];
    const left = accountByExternal.get(match.leftExternalAccountId);
    const right = accountByExternal.get(match.rightExternalAccountId);
    if (!left || !right) return [];
    const leftRoot = resolveCanonicalAccountId(left, merges);
    const rightRoot = resolveCanonicalAccountId(right, merges);
    return leftRoot === rightRoot
      ? []
      : [{ leftAccountId: leftRoot, rightAccountId: rightRoot }];
  });
  const rootIds = [
    ...new Set(
      accountRows.map((row) =>
        resolveCanonicalAccountId(row.account.id, merges),
      ),
    ),
  ];
  const likelyGroupByAccount = new Map<string, string>();
  for (const group of connectedAccountGroups(rootIds, likelyPairs)) {
    const groupId = [...group].sort()[0]!;
    for (const accountId of group) likelyGroupByAccount.set(accountId, groupId);
  }
  const conflictAccounts = new Set<string>();
  for (const match of matchRows) {
    if (!match.conflictDetectedAt) continue;
    const left = accountByExternal.get(match.leftExternalAccountId);
    const right = accountByExternal.get(match.rightExternalAccountId);
    if (left) conflictAccounts.add(resolveCanonicalAccountId(left, merges));
    if (right) conflictAccounts.add(resolveCanonicalAccountId(right, merges));
  }

  return accountRows.map((row): AccountWealthCalculationState => {
    const root = resolveCanonicalAccountId(row.account.id, merges);
    const memberIds = groupedIds.get(root) ?? [row.account.id];
    const groupExternal = externalRows.filter((external) =>
      memberIds.includes(external.accountId),
    );
    let balance: AccountValuationCandidate | null = null;
    let estimatedValue: AccountValuationCandidate | null = null;
    let latestDataRecordedAt: Date | null = null;
    for (const candidate of valuationRows) {
      if (!memberIds.includes(candidate.accountId)) continue;
      const normalized: AccountValuationCandidate = {
        accountId: candidate.accountId,
        amount: candidate.amount,
        currency: candidate.currency,
        effectiveAt: candidate.effectiveAt,
        recordedAt: candidate.recordedAt,
        basis: candidate.valuationBasis as "balance" | "estimated_value",
        valuationCandidateId: candidate.id,
        valuationMethod: "reported",
      };
      if (candidate.valuationBasis === "balance") {
        balance = laterCandidate(balance, normalized);
      } else {
        estimatedValue = laterCandidate(estimatedValue, normalized);
      }
      if (!latestDataRecordedAt || candidate.recordedAt > latestDataRecordedAt) {
        latestDataRecordedAt = candidate.recordedAt;
      }
    }
    const typeSupport = groupExternal.some(
      (external) => external.normalizedTypeSupport === "supported",
    )
      ? "supported"
      : groupExternal.some(
            (external) => external.normalizedTypeSupport === "unrecognized",
          )
        ? "unrecognized"
        : "known_unsupported";
    const lifecycle = groupExternal.some(
      (external) => external.lifecycle === "active",
    )
      ? "active"
      : (groupExternal[0]?.lifecycle ?? "unknown");
    const externalIds = new Set(
      groupExternal.map((external) => external.id),
    );
    const latestResult = resultRows.find(({ result }) =>
      externalIds.has(result.externalAccountId),
    )?.result;
    return {
      accountId: row.account.id,
      accountName: row.account.name,
      archivedAt: row.account.archivedAt,
      balance,
      category: row.account.category as AccountCategory,
      estimatedValue,
      externalLifecycle: lifecycle as ExternalAccountLifecycle,
      identityConflict: conflictAccounts.has(root),
      inclusionPolicy: (row.policy?.inclusionPolicy ??
        "automatic") as AccountInclusionPolicy,
      institutionId: row.account.institutionId,
      institutionName: row.institutionName,
      latestDataRecordedAt,
      likelyDuplicateGroupId: likelyGroupByAccount.get(root) ?? null,
      managementMode: "external",
      mergedIntoAccountId: root === row.account.id ? null : root,
      purpose: row.account.purpose as AccountPurpose,
      refreshUncertain: Boolean(
        latestResult && latestResult.status !== "succeeded",
      ),
      selectedValuationMethod: "reported",
      typeSupport,
    };
  });
}
