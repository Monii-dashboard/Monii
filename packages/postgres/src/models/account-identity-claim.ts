import { desc, eq } from "drizzle-orm";

import { getDatabase } from "../client";
import { accountIdentityClaims } from "../schema/ingestion";
import { defineModelQuery, modelFor } from "./model";

const queries = {
  current: defineModelQuery(() =>
    getDatabase()
      .select()
      .from(accountIdentityClaims)
      .where(eq(accountIdentityClaims.isCurrent, true))
      .orderBy(desc(accountIdentityClaims.updatedAt)),
  ),
};

export class AccountIdentityClaim extends modelFor(
  accountIdentityClaims,
  ["id"] as const,
  queries,
) {}
