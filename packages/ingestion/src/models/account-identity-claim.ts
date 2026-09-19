import { and, desc, eq, ne } from "drizzle-orm";

import { getDatabase } from "@monii/postgres/client";
import { defineModelQuery, modelFor } from "@monii/postgres/model";
import { accountIdentityClaims } from "@monii/postgres/schema/ingestion";
import { isInTransaction } from "@monii/postgres/transaction";

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
  queries,
) {
  static async recordCurrent(input: Readonly<{
    claimType: "account_number" | "iban" | "reported_name";
    externalAccountId: string;
    fingerprint: string;
    keyVersion: string;
    synchronizationRunId: string;
  }>): Promise<void> {
    if (!isInTransaction()) {
      throw new Error(
        "AccountIdentityClaim.recordCurrent requires transaction()",
      );
    }
    await getDatabase()
      .update(accountIdentityClaims)
      .set({ isCurrent: false, updatedAt: new Date() })
      .where(
        and(
          eq(accountIdentityClaims.externalAccountId, input.externalAccountId),
          eq(accountIdentityClaims.claimType, input.claimType),
          eq(accountIdentityClaims.keyVersion, input.keyVersion),
          ne(accountIdentityClaims.fingerprint, input.fingerprint),
          eq(accountIdentityClaims.isCurrent, true),
        ),
      );
    await getDatabase()
      .insert(accountIdentityClaims)
      .values({
        claimType: input.claimType,
        externalAccountId: input.externalAccountId,
        fingerprint: input.fingerprint,
        firstObservedRunId: input.synchronizationRunId,
        keyVersion: input.keyVersion,
        lastObservedRunId: input.synchronizationRunId,
      })
      .onConflictDoUpdate({
        target: [
          accountIdentityClaims.externalAccountId,
          accountIdentityClaims.claimType,
          accountIdentityClaims.keyVersion,
          accountIdentityClaims.fingerprint,
        ],
        set: {
          isCurrent: true,
          lastObservedRunId: input.synchronizationRunId,
          updatedAt: new Date(),
        },
      });
  }
}
