import {
  reconcileAccounts,
  type AccountReconciliationReporter,
  type ReconcileAccountsOutcome,
  type ReconcileAccountsReason,
} from "@monii/account-reconciliation";
import { transaction } from "@monii/postgres/transaction";
import { createWealthSnapshot } from "@monii/wealth-calculation";
import { randomUUID } from "node:crypto";

export type ReconcileFinancialAccountsInput = Readonly<{
  actionId: string;
  reason: Exclude<ReconcileAccountsReason, "synchronization">;
}>;

export type ReconcileFinancialAccountsOutcome = ReconcileAccountsOutcome &
  Readonly<{ snapshotId: string | null }>;

export async function reconcileFinancialAccounts(
  input: ReconcileFinancialAccountsInput,
  reporter?: AccountReconciliationReporter,
): Promise<ReconcileFinancialAccountsOutcome> {
  return transaction(async () => {
    const outcome = await reconcileAccounts(input, reporter);
    const snapshotId = outcome.changed
      ? await createWealthSnapshot(
        {
          actionId: input.actionId,
          causationId: randomUUID(),
          reason: "account_reconciliation",
        },
        reporter,
      )
      : null;

    return { ...outcome, snapshotId };
  });
}
