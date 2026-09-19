import {
  ExternalAccount,
  SynchronizationAccountResult,
  SynchronizationConnectionResult,
} from "../models";
import { transaction } from "@monii/postgres/transaction";

import type {
  NormalizedExternalAccountListing,
  NormalizedExternalConnection,
} from "../external-financial-source";
import type {
  FinancialOperationalReport,
  SynchronizationReporter,
} from "../reporting";
import type { ConnectionPersistenceResult } from "../types";
import { ensureConnection } from "../internal/ensure-connection";
import { reportAfterCommit } from "../internal/report-after-commit";
import { saveKnownAccountFailure } from "../internal/save-known-account-failure";
import { saveSuccessfulAccount } from "../internal/save-successful-account";

export async function recordConnectionResult(
  runId: string,
  connection: NormalizedExternalConnection,
  listing: NormalizedExternalAccountListing,
  reporter?: SynchronizationReporter,
): Promise<ConnectionPersistenceResult> {
  return transaction(async () => {
    const reports: FinancialOperationalReport[] = [];
    const context = await ensureConnection(runId, connection);
    const returnedIds = new Set<string>();
    for (const account of listing.accounts) {
      returnedIds.add(account.externalId);
      reports.push(
        ...(await saveSuccessfulAccount({ ...context, runId }, account)),
      );
    }

    let failedAccountCount = 0;
    for (const failure of listing.failures) {
      if (failure.externalId) returnedIds.add(failure.externalId);
      if (failure.externalId) {
        const knownAccount = await saveKnownAccountFailure({
          externalId: failure.externalId,
          failure: failure.failure,
          runId,
          sourceInstanceId: context.sourceInstanceId,
        });
        reports.push({
          event: "ingestion.account.persistence_failed",
          fields: {
            error_code: failure.failure.code,
            error_kind: failure.failure.kind,
            known_account: knownAccount,
            provider_account_id: failure.externalId,
            run_id: runId,
          },
          level: "warn",
          message: knownAccount
            ? "External account failure persisted while preserving prior data"
            : "External account failure could not be associated with a known account",
        });
      } else {
        reports.push({
          event: "ingestion.account.persistence_failed",
          fields: {
            error_code: failure.failure.code,
            error_kind: failure.failure.kind,
            known_account: false,
            reason: "missing_external_account_id",
            run_id: runId,
          },
          level: "warn",
          message: "External account failure could not be associated with an account",
        });
      }
      failedAccountCount += 1;
    }

    if (listing.isComplete) {
      const knownAccounts = await ExternalAccount.findMany({
        connectionId: context.connectionId,
      });
      for (const externalAccount of knownAccounts) {
        if (returnedIds.has(externalAccount.externalId)) continue;
        await SynchronizationAccountResult.create({
          errorCode: "not_seen",
          errorKind: "provider_listing",
          externalAccountId: externalAccount.id,
          sourceInstanceId: context.sourceInstanceId,
          status: "not_seen",
          synchronizationRunId: runId,
        });
        reports.push({
          event: "ingestion.account.not_seen",
          fields: {
            account_id: externalAccount.accountId,
            account_external_reference_id: externalAccount.id,
            provider_account_id: externalAccount.externalId,
            run_id: runId,
          },
          level: "warn",
          message:
            "Known external account was not present in a complete provider listing",
        });
        failedAccountCount += 1;
      }
    } else {
      failedAccountCount += 1;
      reports.push({
        event: "ingestion.account_listing.incomplete",
        fields: {
          received_account_count: listing.accounts.length,
          reported_total: listing.reportedTotal,
          run_id: runId,
        },
        level: "warn",
        message: "Provider account listing was incomplete; absence was not inferred",
      });
    }

    const status = failedAccountCount > 0 ? "partial" as const : "succeeded" as const;
    await SynchronizationConnectionResult.create({
      connectionId: context.connectionId,
      failedAccountCount,
      reportedActive: connection.active,
      reportedState: connection.sourceState,
      retryAfter: connection.nextTryAt,
      sourceInstanceId: context.sourceInstanceId,
      sourceUpdatedAt: connection.sourceUpdatedAt,
      status,
      successfulAccountCount: listing.accounts.length,
      synchronizationRunId: runId,
    });
    reportAfterCommit(reporter, reports);
    return {
      failedAccountCount,
      status,
      successfulAccountCount: listing.accounts.length,
    };
  });
}
