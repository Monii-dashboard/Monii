import {
  Account,
} from "@monii/accounts/models";
import {
  ExternalAccount,
  ExternalAccountObservation,
  SynchronizationAccountResult,
} from "../models";

import type { NormalizedExternalAccount } from "../external-financial-source";
import type { FinancialOperationalReport } from "../reporting";
import type { StoredConnectionContext } from "./ensure-connection";
import { saveIdentityClaims } from "./save-identity-claims";
import { saveReportedValuation } from "./save-reported-valuation";

export async function saveSuccessfulAccount(
  context: StoredConnectionContext & Readonly<{ runId: string }>,
  account: NormalizedExternalAccount,
): Promise<readonly FinancialOperationalReport[]> {
  let persistenceOutcome: "created" | "updated" = "updated";
  let classificationChanged = false;
  let lifecycleChanged = false;
  const [existingExternalAccount] = await ExternalAccount.findMany({
    externalId: account.externalId,
    sourceInstanceId: context.sourceInstanceId,
  });
  let externalAccount = existingExternalAccount;

  if (!externalAccount) {
    persistenceOutcome = "created";
    const canonicalAccount = await Account.create({
      category: account.category,
      institutionId: context.institutionId,
      managementMode: "external",
      name: account.reportedName,
      purpose: account.purpose,
    });
    externalAccount = await ExternalAccount.create({
      accountId: canonicalAccount.id,
      connectionId: context.connectionId,
      externalId: account.externalId,
      lifecycle: account.lifecycle,
      lifecycleChangedAt: new Date(),
      normalizedTypeSupport: account.typeSupport,
      reportedName: account.reportedName,
      reportedType: account.reportedType,
      sourceInstanceId: context.sourceInstanceId,
    });
  } else {
    lifecycleChanged = externalAccount.lifecycle !== account.lifecycle;
    const updatedExternalAccount = await ExternalAccount.update(
      externalAccount.id,
      {
        connectionId: context.connectionId,
        lastObservedAt: new Date(),
        lifecycle: account.lifecycle,
        ...(lifecycleChanged ? { lifecycleChangedAt: new Date() } : {}),
        normalizedTypeSupport: account.typeSupport,
        reportedName: account.reportedName,
        reportedType: account.reportedType,
      },
    );
    if (!updatedExternalAccount) {
      throw new Error("External account disappeared while updating");
    }
    externalAccount = updatedExternalAccount;

    const canonicalAccount = await Account.find(externalAccount.accountId);
    if (!canonicalAccount) throw new Error("Canonical account does not exist");
    const category =
      canonicalAccount.category === "unknown" && account.category !== "unknown"
        ? account.category
        : canonicalAccount.category;
    const purpose =
      canonicalAccount.purpose === "unknown" && account.purpose !== "unknown"
        ? account.purpose
        : canonicalAccount.purpose;
    if (
      category !== canonicalAccount.category ||
      purpose !== canonicalAccount.purpose
    ) {
      classificationChanged = true;
      await Account.update(canonicalAccount.id, {
        category,
        purpose,
        updatedAt: new Date(),
      });
    }
  }

  const recordedAt = new Date();
  const observation = await ExternalAccountObservation.create({
    accountId: externalAccount.accountId,
    externalAccountId: externalAccount.id,
    observedAt: recordedAt,
    reportedCurrency: account.rawCurrency,
    reportedLifecycle: account.lifecycle,
    sourceInstanceId: context.sourceInstanceId,
    sourceValidAt: account.sourceValidAt,
    synchronizationRunId: context.runId,
  });
  await saveReportedValuation({
    accountId: externalAccount.accountId,
    amount: account.balance,
    currency: account.currency,
    externalAccountObservationId: observation.id,
    recordedAt,
    sourceValidAt: account.sourceValidAt,
    valuationBasis: "balance",
  });
  await saveReportedValuation({
    accountId: externalAccount.accountId,
    amount: account.estimatedValue,
    currency: account.currency,
    externalAccountObservationId: observation.id,
    recordedAt,
    sourceValidAt: account.sourceValidAt,
    valuationBasis: "estimated_value",
  });
  await SynchronizationAccountResult.create({
    externalAccountId: externalAccount.id,
    externalAccountObservationId: observation.id,
    sourceInstanceId: context.sourceInstanceId,
    status: "succeeded",
    synchronizationRunId: context.runId,
  });
  await saveIdentityClaims(
    context.runId,
    externalAccount.id,
    account.identity,
  );

  if (
    persistenceOutcome !== "created" &&
    !classificationChanged &&
    !lifecycleChanged
  ) {
    return [];
  }
  return [{
    event:
      persistenceOutcome === "created"
        ? "ingestion.account.created"
        : "ingestion.account.changed",
    fields: {
      account_id: externalAccount.accountId,
      balance_amount: account.balance,
      category: account.category,
      classification_changed: classificationChanged,
      currency: account.currency,
      estimated_value_amount: account.estimatedValue,
      lifecycle: account.lifecycle,
      lifecycle_changed: lifecycleChanged,
      outcome: persistenceOutcome,
      provider_account_id: account.externalId,
      purpose: account.purpose,
      run_id: context.runId,
      type_support: account.typeSupport,
    },
    level: account.typeSupport === "unrecognized" ? "warn" : "info",
    message:
      persistenceOutcome === "created"
        ? "External financial account created"
        : "External financial account classification or lifecycle changed",
  }];
}
