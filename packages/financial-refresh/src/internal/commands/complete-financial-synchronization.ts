import { reconcileAccounts } from "@monii/account-reconciliation";
import {
  finalizeSynchronizationRun,
  type SynchronizationFailure,
  type SynchronizationReporter,
  type SynchronizationStatus,
} from "@monii/ingestion";
import { transaction } from "@monii/postgres/transaction";
import { createWealthSnapshot } from "@monii/wealth-calculation";

export async function completeFinancialSynchronization(input: Readonly<{
  failure?: SynchronizationFailure;
  reporter?: SynchronizationReporter;
  runId: string;
  status: Exclude<SynchronizationStatus, "running">;
}>): Promise<void> {
  await transaction(async () => {
    const run = await finalizeSynchronizationRun(
      input.runId,
      input.status,
      input.failure,
    );
    await reconcileAccounts(
      {
        actionId: run.actionId,
        reason: "synchronization",
        synchronizationRunId: input.runId,
      },
      input.reporter,
    );
    await createWealthSnapshot(
      {
        actionId: run.actionId,
        causationId: input.runId,
        reason: "synchronization",
        synchronizationRunId: input.runId,
      },
      input.reporter,
    );
  });
}
