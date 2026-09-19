import type { SynchronizationFailure } from "../external-financial-source";
import { SynchronizationRun } from "../models";
import type { SynchronizationStatus } from "../types";

export type FinalizedSynchronizationRun = Readonly<{
  actionId: string;
}>;

/** Marks one running synchronization as terminal. Workflow follow-up belongs to
 * the caller because reconciliation and snapshotting are separate capabilities.
 */
export async function finalizeSynchronizationRun(
  runId: string,
  status: Exclude<SynchronizationStatus, "running">,
  failure?: SynchronizationFailure,
): Promise<FinalizedSynchronizationRun> {
  const run = await SynchronizationRun.updateIf(
    runId,
    { status: "running" },
    {
      errorCode: failure?.code ?? null,
      errorKind: failure?.kind ?? null,
      finishedAt: new Date(),
      status,
    },
  );
  if (!run) throw new Error(`Synchronization run ${runId} is not running`);

  return { actionId: run.actionId };
}
