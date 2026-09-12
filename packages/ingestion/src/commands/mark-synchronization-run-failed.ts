import { getDatabase } from "@monii/postgres/client";
import { synchronizationRuns } from "@monii/postgres/schema/ingestion";
import { and, eq } from "drizzle-orm";

import type { SynchronizationFailure } from "../external-financial-source";

export async function markSynchronizationRunFailed(
  runId: string,
  failure: SynchronizationFailure,
): Promise<void> {
  await getDatabase()
    .update(synchronizationRuns)
    .set({
      errorCode: failure.code,
      errorKind: failure.kind,
      finishedAt: new Date(),
      status: "failed",
    })
    .where(
      and(
        eq(synchronizationRuns.id, runId),
        eq(synchronizationRuns.status, "running"),
      ),
    );
}
