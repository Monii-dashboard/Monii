import { getDatabase } from "@monii/postgres/client";
import { synchronizationRuns } from "@monii/postgres/schema";
import { transaction } from "@monii/postgres/transaction";
import { createWealthSnapshot } from "@monii/wealth-calculation";
import { and, eq } from "drizzle-orm";

import type { SynchronizationFailure } from "../../external-financial-source";
import type { SynchronizationReporter } from "../../reporting";
import type { SynchronizationStatus } from "../../types";
import { reportAfterCommit } from "../report-after-commit";
import { reconcileAccountIdentities } from "./reconcile-account-identities";

export async function finalizeSynchronizationRun(
  runId: string,
  status: Exclude<SynchronizationStatus, "running">,
  failure?: SynchronizationFailure,
  reporter?: SynchronizationReporter,
): Promise<void> {
  await transaction(async () => {
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

    reportAfterCommit(reporter, await reconcileAccountIdentities(runId));
    await createWealthSnapshot(
      {
        actionId: run.actionId,
        causationId: runId,
        reason: "synchronization",
        synchronizationRunId: runId,
      },
      reporter,
    );
  });
}
