import { desc } from "drizzle-orm";

import { getDatabase } from "@monii/postgres/client";
import { defineModelQuery, modelFor } from "@monii/postgres/model";
import { snapshots } from "@monii/postgres/schema/wealth";

const queries = {
  latest: defineModelQuery(() =>
    getDatabase()
      .select()
      .from(snapshots)
      .orderBy(desc(snapshots.recordedAt), desc(snapshots.id))
      .limit(1),
  ),
};

export class WealthSnapshot extends modelFor(
  snapshots,
  ["id"] as const,
  queries,
) {}
