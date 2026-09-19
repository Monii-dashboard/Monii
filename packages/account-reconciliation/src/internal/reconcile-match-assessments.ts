import { getDatabase } from "@monii/postgres/client";
import { accountMatchAssessments } from "@monii/postgres/schema/reconciliation";
import { eq } from "drizzle-orm";

import { AccountMatchAssessment } from "../models";
import {
  assessExternalAccountIdentity,
  type IdentityAccount,
} from "../assess-account-identity";
import type { AccountReconciliationReport } from "../reporting";

export async function reconcileMatchAssessments(
  synchronizationRunId: string | undefined,
  identityAccounts: readonly IdentityAccount[],
): Promise<AccountReconciliationReport[]> {
  const db = getDatabase();
  const reports: AccountReconciliationReport[] = [];
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
          event: "account_reconciliation.match.changed",
          fields: {
            classification,
            left_account_id: left.accountId,
            left_external_account_id: leftExternalAccountId,
            previous_classification: existing?.classification ?? null,
            reason_codes: assessment.reasonCodes,
            right_account_id: right.accountId,
            right_external_account_id: rightExternalAccountId,
            synchronization_run_id: synchronizationRunId ?? null,
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
            event: "account_reconciliation.identity_conflict.detected",
            fields: {
              left_account_id: left.accountId,
              left_external_account_id: leftExternalAccountId,
              reason_codes: assessment.reasonCodes,
              right_account_id: right.accountId,
              right_external_account_id: rightExternalAccountId,
              synchronization_run_id: synchronizationRunId ?? null,
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
          firstDetectedSynchronizationRunId: synchronizationRunId,
          isActive: true,
          lastDetectedSynchronizationRunId: synchronizationRunId,
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
            lastDetectedSynchronizationRunId: synchronizationRunId,
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
      event: "account_reconciliation.likely_duplicate.cleared",
      fields: {
        left_account_id:
          identityByExternalAccount.get(previous.leftExternalAccountId)
            ?.accountId ?? null,
        left_external_account_id: previous.leftExternalAccountId,
        right_account_id:
          identityByExternalAccount.get(previous.rightExternalAccountId)
            ?.accountId ?? null,
        right_external_account_id: previous.rightExternalAccountId,
        synchronization_run_id: synchronizationRunId ?? null,
      },
      level: "warn",
      message:
        "Previously likely duplicate account pair is no longer an active match",
    });
  }
  return reports;
}
