import { desc } from "drizzle-orm";

import { getDatabase } from "../client";
import { snapshots } from "../schema/wealth";
import { defineModelQuery, modelFor } from "./model";

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
