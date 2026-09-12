import { desc, eq } from "drizzle-orm";

import { getDatabase } from "../client";
import { synchronizationRuns } from "../schema/ingestion";
import { defineModelQuery, modelFor } from "./model";

const queries = {
  latest_status: defineModelQuery(() =>
    getDatabase()
      .select({ status: synchronizationRuns.status })
      .from(synchronizationRuns)
      .orderBy(desc(synchronizationRuns.startedAt))
      .limit(1),
  ),
  last_successful_completion: defineModelQuery(() =>
    getDatabase()
      .select({ finishedAt: synchronizationRuns.finishedAt })
      .from(synchronizationRuns)
      .where(eq(synchronizationRuns.status, "succeeded"))
      .orderBy(desc(synchronizationRuns.finishedAt))
      .limit(1),
  ),
};

export class SynchronizationRun extends modelFor(
  synchronizationRuns,
  ["id"] as const,
  queries,
) {}
