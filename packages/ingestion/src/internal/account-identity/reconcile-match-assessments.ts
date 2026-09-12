import { getDatabase } from "@monii/postgres/client";
import { AccountMatchAssessment } from "@monii/postgres/models";
import { accountMatchAssessments } from "@monii/postgres/schema";
import { eq } from "drizzle-orm";

import {
  assessExternalAccountIdentity,
  type IdentityAccount,
} from "../../account-identity";
import type { FinancialOperationalReport } from "../../reporting";

export async function reconcileMatchAssessments(
  runId: string,
  identityAccounts: readonly IdentityAccount[],
): Promise<FinancialOperationalReport[]> {
  const db = getDatabase();
  const reports: FinancialOperationalReport[] = [];
  const previousActiveLikelyMatches = await AccountMatchAssessment.findMany({
    classification: "likely_duplicate",
    isActive: true,
  });
  const activeLikelyPairKeys = new Set<string>();
  const identityByExternalAccount = new Map(
    identityAccounts.map((account) => [account.externalAccountId, account]),
  );

  await db
    .update(accountMatchAssessments)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(accountMatchAssessments.classification, "likely_duplicate"));

  for (let leftIndex = 0; leftIndex < identityAccounts.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < identityAccounts.length;
      rightIndex += 1
    ) {
      const left = identityAccounts[leftIndex]!;
      const right = identityAccounts[rightIndex]!;
      const assessment = assessExternalAccountIdentity(left, right);
      const classification = assessment.classification;
      const [leftExternalAccountId, rightExternalAccountId] =
        left.externalAccountId < right.externalAccountId
          ? [left.externalAccountId, right.externalAccountId]
          : [right.externalAccountId, left.externalAccountId];
      const [existing] = await AccountMatchAssessment.findMany({
        leftExternalAccountId,
        rightExternalAccountId,
      });
      const pairKey = `${leftExternalAccountId}:${rightExternalAccountId}`;
      if (classification === "likely_duplicate") {
        activeLikelyPairKeys.add(pairKey);
      }
      if (
        classification !== "distinct" &&
        existing?.classification !== classification
      ) {
        reports.push({
          event: "ingestion.identity_match.changed",
          fields: {
            classification,
            left_account_id: left.accountId,
            left_external_account_id: leftExternalAccountId,
            previous_classification: existing?.classification ?? null,
            reason_codes: assessment.reasonCodes,
            right_account_id: right.accountId,
            right_external_account_id: rightExternalAccountId,
            run_id: runId,
          },
          level: classification === "likely_duplicate" ? "warn" : "info",
          message:
            classification === "confirmed_duplicate"
              ? "External account pair confirmed as the same financial account"
              : "External account pair now requires duplicate review",
        });
      }
      if (classification === "distinct") {
        if (existing?.classification === "confirmed_duplicate") {
          await db
            .update(accountMatchAssessments)
            .set({ conflictDetectedAt: new Date(), updatedAt: new Date() })
            .where(eq(accountMatchAssessments.id, existing.id));
          reports.push({
            event: "ingestion.identity.conflict_detected",
            fields: {
              left_account_id: left.accountId,
              left_external_account_id: leftExternalAccountId,
              reason_codes: assessment.reasonCodes,
              right_account_id: right.accountId,
              right_external_account_id: rightExternalAccountId,
              run_id: runId,
            },
            level: "warn",
            message:
              "Current identity evidence conflicts with a confirmed account match",
          });
        }
        continue;
      }
      const durableClassification =
        existing?.classification === "confirmed_duplicate"
          ? "confirmed_duplicate"
          : classification;
      await db
        .insert(accountMatchAssessments)
        .values({
          classification: durableClassification,
          evidence:
            durableClassification === "confirmed_duplicate"
              ? "institution_iban_currency_category"
              : "institution_currency_category_reported_name",
          firstDetectedRunId: runId,
          isActive: true,
          lastDetectedRunId: runId,
          leftExternalAccountId,
          rightExternalAccountId,
        })
        .onConflictDoUpdate({
          target: [
            accountMatchAssessments.leftExternalAccountId,
            accountMatchAssessments.rightExternalAccountId,
          ],
          set: {
            classification: durableClassification,
            isActive: true,
            lastDetectedRunId: runId,
            updatedAt: new Date(),
          },
        });
    }
  }

  for (const previous of previousActiveLikelyMatches) {
    const pairKey =
      `${previous.leftExternalAccountId}:${previous.rightExternalAccountId}`;
    if (activeLikelyPairKeys.has(pairKey)) continue;
    reports.push({
      event: "ingestion.likely_duplicate.cleared",
      fields: {
        left_account_id:
          identityByExternalAccount.get(previous.leftExternalAccountId)
            ?.accountId ?? null,
        left_external_account_id: previous.leftExternalAccountId,
        right_account_id:
          identityByExternalAccount.get(previous.rightExternalAccountId)
            ?.accountId ?? null,
        right_external_account_id: previous.rightExternalAccountId,
        run_id: runId,
      },
      level: "warn",
      message:
        "Previously likely duplicate account pair is no longer an active match",
    });
  }
  return reports;
}
