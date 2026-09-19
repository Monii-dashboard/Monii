import { eq } from "drizzle-orm";

import { getDatabase } from "@monii/postgres/client";
import { modelFor } from "@monii/postgres/model";
import { accountMatchAssessments } from "@monii/postgres/schema/reconciliation";

export class AccountMatchAssessment extends modelFor(accountMatchAssessments) {
  static async deactivateLikelyDuplicates(): Promise<void> {
    await getDatabase()
      .update(accountMatchAssessments)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(accountMatchAssessments.classification, "likely_duplicate"));
  }

  static async recordActiveMatch(input: Readonly<{
    classification: "confirmed_duplicate" | "likely_duplicate";
    evidence:
      | "institution_currency_category_reported_name"
      | "institution_iban_currency_category";
    leftExternalAccountId: string;
    rightExternalAccountId: string;
    synchronizationRunId: string | undefined;
  }>): Promise<void> {
    await getDatabase()
      .insert(accountMatchAssessments)
      .values({
        classification: input.classification,
        evidence: input.evidence,
        firstDetectedSynchronizationRunId: input.synchronizationRunId,
        isActive: true,
        lastDetectedSynchronizationRunId: input.synchronizationRunId,
        leftExternalAccountId: input.leftExternalAccountId,
        rightExternalAccountId: input.rightExternalAccountId,
      })
      .onConflictDoUpdate({
        target: [
          accountMatchAssessments.leftExternalAccountId,
          accountMatchAssessments.rightExternalAccountId,
        ],
        set: {
          classification: input.classification,
          isActive: true,
          lastDetectedSynchronizationRunId: input.synchronizationRunId,
          updatedAt: new Date(),
        },
      });
  }
}
