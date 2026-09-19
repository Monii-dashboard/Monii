import {
  connectedAccountGroups,
  createCanonicalAccountIdResolver,
  type AccountCategory,
  type AccountPurpose,
  type AccountValuationCandidate,
  type ExternalAccountLifecycle,
} from "@monii/accounts";
import { getDatabase } from "@monii/postgres/client";
import {
  AccountMerge,
} from "@monii/accounts/models";
import { AccountMatchAssessment } from "@monii/account-reconciliation/models";
import {
  accounts,
  accountValuationCandidates,
  institutions,
} from "@monii/postgres/schema/financial";
import {
  externalAccounts,
  synchronizationAccountResults,
  synchronizationRuns,
} from "@monii/postgres/schema/ingestion";
import {
  accountPolicies,
} from "@monii/postgres/schema/wealth";
import { and, desc, eq, sql } from "drizzle-orm";

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
      (right.recordedAt.getTime() > left.recordedAt.getTime() ||
        (right.recordedAt.getTime() === left.recordedAt.getTime() &&
          right.valuationCandidateId > left.valuationCandidateId)))
    ? right
    : left;
}

export async function loadAccountCalculationStates(): Promise<
  readonly AccountWealthCalculationState[]
> {
  const db = getDatabase();
  const latestCandidate = (
    valuationBasis: "balance" | "estimated_value",
    alias: string,
  ) =>
    db
      .select({
        accountId: accountValuationCandidates.accountId,
        amount: accountValuationCandidates.amount,
        currency: accountValuationCandidates.currency,
        effectiveAt: accountValuationCandidates.effectiveAt,
        id: accountValuationCandidates.id,
        recordedAt: accountValuationCandidates.recordedAt,
        valuationBasis: accountValuationCandidates.valuationBasis,
      })
      .from(accountValuationCandidates)
      .where(
        and(
          eq(accountValuationCandidates.accountId, accounts.id),
          eq(accountValuationCandidates.valuationMethod, "reported"),
          eq(accountValuationCandidates.valuationBasis, valuationBasis),
        ),
      )
      .orderBy(
        sql`coalesce(${accountValuationCandidates.effectiveAt}, ${accountValuationCandidates.recordedAt}) desc`,
        desc(accountValuationCandidates.recordedAt),
        desc(accountValuationCandidates.id),
      )
      .limit(1)
      .as(alias);
  const latestBalance = latestCandidate("balance", "latest_account_balance");
  const latestEstimatedValue = latestCandidate(
    "estimated_value",
    "latest_account_estimated_value",
  );
  const accountRows = await db
    .select({
      account: accounts,
      balance: {
        accountId: latestBalance.accountId,
        amount: latestBalance.amount,
        currency: latestBalance.currency,
        effectiveAt: latestBalance.effectiveAt,
        id: latestBalance.id,
        recordedAt: latestBalance.recordedAt,
        valuationBasis: latestBalance.valuationBasis,
      },
      estimatedValue: {
        accountId: latestEstimatedValue.accountId,
        amount: latestEstimatedValue.amount,
        currency: latestEstimatedValue.currency,
        effectiveAt: latestEstimatedValue.effectiveAt,
        id: latestEstimatedValue.id,
        recordedAt: latestEstimatedValue.recordedAt,
        valuationBasis: latestEstimatedValue.valuationBasis,
      },
      institutionName: institutions.name,
      policy: accountPolicies,
    })
    .from(accounts)
    .leftJoin(institutions, eq(accounts.institutionId, institutions.id))
    .leftJoin(accountPolicies, eq(accounts.id, accountPolicies.accountId))
    .leftJoinLateral(latestBalance, sql`true`)
    .leftJoinLateral(latestEstimatedValue, sql`true`);
  const merges = await AccountMerge.findMany();
  const resolveCanonicalAccountId = createCanonicalAccountIdResolver(merges);
  const inclusionPolicyByRoot = new Map<string, AccountInclusionPolicy>();
  for (const row of accountRows) {
    const root = resolveCanonicalAccountId(row.account.id);
    const policy = (row.policy?.inclusionPolicy ??
      "automatic") as AccountInclusionPolicy;
    const previous = inclusionPolicyByRoot.get(root) ?? "automatic";
    inclusionPolicyByRoot.set(
      root,
      policy === "exclude" || previous === "exclude"
        ? "exclude"
        : policy === "include" || previous === "include"
          ? "include"
          : "automatic",
    );
  }
  const latestResult = db
    .select({
      finishedAt: synchronizationAccountResults.finishedAt,
      id: synchronizationAccountResults.id,
      status: synchronizationAccountResults.status,
      synchronizationRunId:
        synchronizationAccountResults.synchronizationRunId,
    })
    .from(synchronizationAccountResults)
    .where(
      eq(
        synchronizationAccountResults.externalAccountId,
        externalAccounts.id,
      ),
    )
    .orderBy(
      desc(synchronizationAccountResults.finishedAt),
      desc(synchronizationAccountResults.id),
    )
    .limit(1)
    .as("latest_synchronization_account_result");
  const externalRows = await db
    .select({
      accountId: externalAccounts.accountId,
      id: externalAccounts.id,
      latestResult: {
        finishedAt: latestResult.finishedAt,
        id: latestResult.id,
        status: latestResult.status,
      },
      latestResultRunStartedAt: synchronizationRuns.startedAt,
      lifecycle: externalAccounts.lifecycle,
      normalizedTypeSupport: externalAccounts.normalizedTypeSupport,
    })
    .from(externalAccounts)
    .leftJoinLateral(latestResult, sql`true`)
    .leftJoin(
      synchronizationRuns,
      eq(synchronizationRuns.id, latestResult.synchronizationRunId),
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
    const leftRoot = resolveCanonicalAccountId(left);
    const rightRoot = resolveCanonicalAccountId(right);
    return leftRoot === rightRoot
      ? []
      : [{ leftAccountId: leftRoot, rightAccountId: rightRoot }];
  });
  const rootIds = [
    ...new Set(
      accountRows.map((row) =>
        resolveCanonicalAccountId(row.account.id),
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
    if (left) conflictAccounts.add(resolveCanonicalAccountId(left));
    if (right) conflictAccounts.add(resolveCanonicalAccountId(right));
  }

  const externalRowsByRoot = new Map<string, typeof externalRows>();
  for (const external of externalRows) {
    const root = resolveCanonicalAccountId(external.accountId);
    const group = externalRowsByRoot.get(root);
    if (group) group.push(external);
    else externalRowsByRoot.set(root, [external]);
  }
  const valuationsByRoot = new Map<
    string,
    Readonly<{
      balance: AccountValuationCandidate | null;
      estimatedValue: AccountValuationCandidate | null;
      latestDataRecordedAt: Date | null;
    }>
  >();
  for (const row of accountRows) {
    const root = resolveCanonicalAccountId(row.account.id);
    const previous = valuationsByRoot.get(root) ?? {
      balance: null,
      estimatedValue: null,
      latestDataRecordedAt: null,
    };
    const normalize = (
      candidate: typeof row.balance,
    ): AccountValuationCandidate | null =>
      candidate
        ? {
            accountId: candidate.accountId,
            amount: candidate.amount,
            basis: candidate.valuationBasis as "balance" | "estimated_value",
            currency: candidate.currency,
            effectiveAt: candidate.effectiveAt,
            recordedAt: candidate.recordedAt,
            valuationCandidateId: candidate.id,
            valuationMethod: "reported",
          }
        : null;
    const balance = normalize(row.balance);
    const estimatedValue = normalize(row.estimatedValue);
    const candidates = [balance, estimatedValue].filter(
      (candidate): candidate is AccountValuationCandidate => candidate !== null,
    );
    const latestRecordedAt = candidates.reduce<Date | null>(
      (latest, candidate) =>
        !latest || candidate.recordedAt > latest
          ? candidate.recordedAt
          : latest,
      previous.latestDataRecordedAt,
    );
    valuationsByRoot.set(root, {
      balance: balance
        ? laterCandidate(previous.balance, balance)
        : previous.balance,
      estimatedValue: estimatedValue
        ? laterCandidate(previous.estimatedValue, estimatedValue)
        : previous.estimatedValue,
      latestDataRecordedAt: latestRecordedAt,
    });
  }

  return accountRows.map((row): AccountWealthCalculationState => {
    const root = resolveCanonicalAccountId(row.account.id);
    const groupExternal = externalRowsByRoot.get(root) ?? [];
    const valuations = valuationsByRoot.get(root) ?? {
      balance: null,
      estimatedValue: null,
      latestDataRecordedAt: null,
    };
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
    const groupLatestResult = groupExternal.reduce<
      Readonly<{
        finishedAt: Date;
        id: string;
        runStartedAt: Date;
        status: string;
      }> | null
    >((latest, external) => {
      if (!external.latestResult || !external.latestResultRunStartedAt) {
        return latest;
      }
      const candidate = {
        ...external.latestResult,
        runStartedAt: external.latestResultRunStartedAt,
      };
      if (!latest) return candidate;
      const runTimeDifference =
        candidate.runStartedAt.getTime() - latest.runStartedAt.getTime();
      const resultTimeDifference =
        candidate.finishedAt.getTime() - latest.finishedAt.getTime();
      return runTimeDifference > 0 ||
        (runTimeDifference === 0 &&
          (resultTimeDifference > 0 ||
            (resultTimeDifference === 0 && candidate.id > latest.id)))
        ? candidate
        : latest;
    }, null);
    return {
      accountId: row.account.id,
      accountName: row.account.name,
      archivedAt: row.account.archivedAt,
      balance: valuations.balance,
      category: row.account.category as AccountCategory,
      estimatedValue: valuations.estimatedValue,
      externalLifecycle: lifecycle as ExternalAccountLifecycle,
      identityConflict: conflictAccounts.has(root),
      inclusionPolicy: inclusionPolicyByRoot.get(root) ?? "automatic",
      institutionId: row.account.institutionId,
      institutionName: row.institutionName,
      latestDataRecordedAt: valuations.latestDataRecordedAt,
      likelyDuplicateGroupId: likelyGroupByAccount.get(root) ?? null,
      managementMode: "external",
      mergedIntoAccountId: root === row.account.id ? null : root,
      purpose: row.account.purpose as AccountPurpose,
      refreshUncertain: Boolean(
        groupLatestResult && groupLatestResult.status !== "succeeded",
      ),
      selectedValuationMethod: "reported",
      typeSupport,
    };
  });
}
