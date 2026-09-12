import {
  connectedAccountGroups,
  resolveCanonicalAccountId,
} from "@monii/accounts";
import { getDatabase } from "@monii/postgres/client";
import { AccountMerge } from "@monii/postgres/models";
import {
  accountMatchAssessments,
  accountMerges,
  accountPolicies,
  accounts,
  externalAccounts,
} from "@monii/postgres/schema";
import { asc, eq, inArray } from "drizzle-orm";

import type { FinancialOperationalReport } from "../../reporting";

export async function reconcileConfirmedMerges(
  runId: string,
): Promise<FinancialOperationalReport[]> {
  const db = getDatabase();
  const reports: FinancialOperationalReport[] = [];
  const confirmed = await db
    .select({
      leftAccountId: externalAccounts.accountId,
      rightExternalAccountId: accountMatchAssessments.rightExternalAccountId,
    })
    .from(accountMatchAssessments)
    .innerJoin(
      externalAccounts,
      eq(externalAccounts.id, accountMatchAssessments.leftExternalAccountId),
    )
    .where(eq(accountMatchAssessments.classification, "confirmed_duplicate"));
  const rightIds = confirmed.map((match) => match.rightExternalAccountId);
  const rightRows = rightIds.length
    ? await db
        .select({ accountId: externalAccounts.accountId, id: externalAccounts.id })
        .from(externalAccounts)
        .where(inArray(externalAccounts.id, rightIds))
    : [];
  const rightById = new Map(rightRows.map((row) => [row.id, row.accountId]));
  const pairs = confirmed.flatMap((match) => {
    const rightAccountId = rightById.get(match.rightExternalAccountId);
    return rightAccountId
      ? [{ leftAccountId: match.leftAccountId, rightAccountId }]
      : [];
  });
  const allMerges = await AccountMerge.findMany();
  const resolvedPairs = pairs.map((pair) => ({
    leftAccountId: resolveCanonicalAccountId(pair.leftAccountId, allMerges),
    rightAccountId: resolveCanonicalAccountId(pair.rightAccountId, allMerges),
  }));
  const accountIds = [
    ...new Set(
      resolvedPairs.flatMap((pair) => [
        pair.leftAccountId,
        pair.rightAccountId,
      ]),
    ),
  ];
  for (const group of connectedAccountGroups(accountIds, resolvedPairs)) {
    const groupAccounts = await db
      .select({
        createdAt: accounts.createdAt,
        id: accounts.id,
        inclusionPolicy: accountPolicies.inclusionPolicy,
        purpose: accounts.purpose,
      })
      .from(accounts)
      .leftJoin(accountPolicies, eq(accounts.id, accountPolicies.accountId))
      .where(inArray(accounts.id, group))
      .orderBy(asc(accounts.createdAt), asc(accounts.id));
    const canonical = groupAccounts[0];
    if (!canonical) continue;
    const mergedIds = groupAccounts
      .filter((account) => account.id !== canonical.id)
      .map((account) => account.id);
    if (!mergedIds.length) continue;
    const inclusionPolicy = groupAccounts.some(
      (account) => account.inclusionPolicy === "exclude",
    )
      ? "exclude"
      : groupAccounts.some((account) => account.inclusionPolicy === "include")
        ? "include"
        : "automatic";
    const purpose = groupAccounts.some(
      (account) => account.purpose === "business",
    )
      ? "business"
      : groupAccounts.some((account) => account.purpose === "personal")
        ? "personal"
        : "unknown";
    await db
      .update(accountPolicies)
      .set({ inclusionPolicy, updatedAt: new Date() })
      .where(eq(accountPolicies.accountId, canonical.id));
    await db
      .update(accounts)
      .set({ purpose, updatedAt: new Date() })
      .where(eq(accounts.id, canonical.id));
    await db
      .insert(accountMerges)
      .values(
        mergedIds.map((mergedAccountId) => ({
          canonicalAccountId: canonical.id,
          mergedAccountId,
          reason: "confirmed_external_identity",
        })),
      )
      .onConflictDoNothing();
    reports.push({
      event: "accounts.merge.completed",
      fields: {
        canonical_account_id: canonical.id,
        canonical_selection_rule: "oldest_created_at_then_account_id",
        inclusion_policy: inclusionPolicy,
        merged_account_count: mergedIds.length,
        merged_account_ids: mergedIds,
        purpose,
        run_id: runId,
      },
      level: "info",
      message: "Confirmed duplicate accounts merged into a canonical account",
    });
  }
  return reports;
}
