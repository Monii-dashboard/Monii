import { afterCommit, transaction } from "@monii/postgres/transaction";

import { loadIdentityAccounts } from "../internal/load-identity-accounts";
import { reconcileConfirmedMerges } from "../internal/reconcile-confirmed-merges";
import { reconcileMatchAssessments } from "../internal/reconcile-match-assessments";
import type { AccountReconciliationReporter } from "../reporting";
import type {
  ReconcileAccountsOutcome,
  ReconcileAccountsReason,
} from "../types";

export type ReconcileAccountsInput = Readonly<{
  actionId: string;
  reason: ReconcileAccountsReason;
  synchronizationRunId?: string;
}>;

export async function reconcileAccounts(
  input: ReconcileAccountsInput,
  reporter?: AccountReconciliationReporter,
): Promise<ReconcileAccountsOutcome> {
  return transaction(async () => {
    const identityAccounts = await loadIdentityAccounts();
    const reports = [
      ...await reconcileMatchAssessments(
        input.synchronizationRunId,
        identityAccounts,
      ),
      ...await reconcileConfirmedMerges(input.synchronizationRunId),
    ];
    const count = (event: string) =>
      reports.filter((report) => report.event === event).length;
    const outcome = {
      changed: reports.length > 0,
      clearedLikelyMatchCount: count(
        "account_reconciliation.likely_duplicate.cleared",
      ),
      confirmedMergeCount: count("accounts.merge.completed"),
      conflictCount: count(
        "account_reconciliation.identity_conflict.detected",
      ),
      matchChangeCount: count("account_reconciliation.match.changed"),
    } satisfies ReconcileAccountsOutcome;

    afterCommit(() => {
      for (const report of reports) {
        reporter?.report({
          ...report,
          fields: {
            ...report.fields,
            action_id: input.actionId,
            reconciliation_reason: input.reason,
          },
        });
      }
    });
    return outcome;
  });
}
