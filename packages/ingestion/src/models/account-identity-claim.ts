import { desc, eq } from "drizzle-orm";

import { getDatabase } from "@monii/postgres/client";
import { defineModelQuery, modelFor } from "@monii/postgres/model";
import { accountIdentityClaims } from "@monii/postgres/schema/ingestion";

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
