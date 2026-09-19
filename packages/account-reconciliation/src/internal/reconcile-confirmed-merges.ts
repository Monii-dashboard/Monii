import {
  connectedAccountGroups,
  mergeAccounts,
  resolveCanonicalAccountId,
} from "@monii/accounts";
import { AccountMerge } from "@monii/accounts/models";
import { getDatabase } from "@monii/postgres/client";
import { externalAccounts } from "@monii/postgres/schema/ingestion";
import { accountMatchAssessments } from "@monii/postgres/schema/reconciliation";
import { eq, inArray } from "drizzle-orm";

import type { AccountReconciliationReport } from "../reporting";

export async function reconcileConfirmedMerges(
  synchronizationRunId: string | undefined,
): Promise<AccountReconciliationReport[]> {
  const db = getDatabase();
  const reports: AccountReconciliationReport[] = [];
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
    const merged = await mergeAccounts({
      accountIds: group,
      reason: "confirmed_external_identity",
    });
    if (!merged) continue;
    reports.push({
      event: "accounts.merge.completed",
      fields: {
        canonical_account_id: merged.canonicalAccountId,
        canonical_selection_rule: "oldest_created_at_then_account_id",
        merged_account_count: merged.mergedAccountIds.length,
        merged_account_ids: merged.mergedAccountIds,
        purpose: merged.purpose,
        synchronization_run_id: synchronizationRunId ?? null,
      },
      level: "info",
      message: "Confirmed duplicate accounts merged into a canonical account",
    });
  }
  return reports;
}
