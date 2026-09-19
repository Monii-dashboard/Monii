import { getDatabase } from "@monii/postgres/client";
import { synchronizationRuns } from "@monii/postgres/schema/ingestion";
import { and, eq } from "drizzle-orm";

import type { SynchronizationFailure } from "../external-financial-source";
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
  const [run] = await getDatabase()
    .update(synchronizationRuns)
    .set({
      errorCode: failure?.code ?? null,
      errorKind: failure?.kind ?? null,
      finishedAt: new Date(),
      status,
    })
    .where(
      and(
        eq(synchronizationRuns.id, runId),
        eq(synchronizationRuns.status, "running"),
      ),
    )
    .returning({ actionId: synchronizationRuns.actionId });
  if (!run) throw new Error(`Synchronization run ${runId} is not running`);

  return run;
}
