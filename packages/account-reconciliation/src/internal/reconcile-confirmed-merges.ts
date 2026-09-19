import {
  connectedAccountGroups,
  mergeAccounts,
  resolveCanonicalAccountId,
} from "@monii/accounts";
import { AccountMerge } from "@monii/accounts/models";
import { getDatabase } from "@monii/postgres/client";
import { externalAccounts } from "@monii/postgres/schema/ingestion";
import { accountMatchAssessments } from "@monii/postgres/schema/reconciliation";
import { aliasedTable, eq } from "drizzle-orm";

import type { AccountReconciliationReport } from "../reporting";

export async function reconcileConfirmedMerges(
  synchronizationRunId: string | undefined,
): Promise<AccountReconciliationReport[]> {
  const db = getDatabase();
  const reports: AccountReconciliationReport[] = [];
  const leftExternalAccounts = aliasedTable(
    externalAccounts,
    "left_external_accounts",
  );
  const rightExternalAccounts = aliasedTable(
    externalAccounts,
    "right_external_accounts",
  );
  const confirmed = await db
    .select({
      leftAccountId: leftExternalAccounts.accountId,
      rightAccountId: rightExternalAccounts.accountId,
    })
    .from(accountMatchAssessments)
    .innerJoin(
      leftExternalAccounts,
      eq(
        leftExternalAccounts.id,
        accountMatchAssessments.leftExternalAccountId,
      ),
    )
    .innerJoin(
      rightExternalAccounts,
      eq(
        rightExternalAccounts.id,
        accountMatchAssessments.rightExternalAccountId,
      ),
    )
    .where(eq(accountMatchAssessments.classification, "confirmed_duplicate"));
  const pairs = confirmed.map((match) => ({
    leftAccountId: match.leftAccountId,
    rightAccountId: match.rightAccountId,
  }));
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
