import { desc, eq } from "drizzle-orm";

import { getDatabase } from "@monii/postgres/client";
import { defineModelQuery, modelFor } from "@monii/postgres/model";
import { synchronizationRuns } from "@monii/postgres/schema/ingestion";

const queries = {
  latest_status: defineModelQuery(() =>
    getDatabase()
      .select({ status: synchronizationRuns.status })
      .from(synchronizationRuns)
      .orderBy(
        desc(synchronizationRuns.startedAt),
        desc(synchronizationRuns.id),
      )
      .limit(1),
  ),
  last_successful_completion: defineModelQuery(() =>
    getDatabase()
      .select({ finishedAt: synchronizationRuns.finishedAt })
      .from(synchronizationRuns)
      .where(eq(synchronizationRuns.status, "succeeded"))
      .orderBy(
        desc(synchronizationRuns.finishedAt),
        desc(synchronizationRuns.id),
      )
      .limit(1),
  ),
};

export class SynchronizationRun extends modelFor(
  synchronizationRuns,
  queries,
) {}
