import type { SynchronizationFailure } from "../external-financial-source";
import { SynchronizationRun } from "../models";

export async function markSynchronizationRunFailed(
  runId: string,
  failure: SynchronizationFailure,
): Promise<void> {
  await SynchronizationRun.updateIf(
    runId,
    { status: "running" },
    {
      errorCode: failure.code,
      errorKind: failure.kind,
      finishedAt: new Date(),
      status: "failed",
    },
  );
}
