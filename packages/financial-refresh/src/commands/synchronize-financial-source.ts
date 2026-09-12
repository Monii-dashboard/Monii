import {
  identifySynchronizationSource,
  markSynchronizationRunFailed,
  recordConnectionFailure,
  recordConnectionResult,
  startSynchronizationRun,
  type ExternalFinancialSource,
  type FinancialOperationalReport,
  type SynchronizationFailure,
  type SynchronizationReporter,
  type SynchronizationResult,
} from "@monii/ingestion";

import { completeFinancialSynchronization } from "../internal/commands/complete-financial-synchronization";

export function synchronizationFailureFrom(
  error: unknown,
): SynchronizationFailure {
  if (typeof error !== "object" || error === null) {
    return { code: null, kind: "unexpected" };
  }
  const candidate = error as Readonly<{
    code?: unknown;
    kind?: unknown;
    status?: unknown;
  }>;
  const status =
    typeof candidate.status === "number" ? candidate.status : undefined;
  return {
    code:
      typeof candidate.code === "string"
        ? candidate.code
        : status === undefined
          ? null
          : `http_${status}`,
    kind:
      typeof candidate.kind === "string"
        ? candidate.kind
        : status === undefined
          ? "unexpected"
          : "api",
  };
}

export async function synchronizeFinancialSource(input: Readonly<{
  actionId: string;
  adapterKey: string;
  reporter?: SynchronizationReporter;
  source: ExternalFinancialSource;
  sourceKey: string;
  sourceName: string;
}>): Promise<SynchronizationResult> {
  let runId: string | null = null;
  const report = (
    level: FinancialOperationalReport["level"],
    message: string,
    event: string,
    fields?: Readonly<Record<string, unknown>>,
  ) => input.reporter?.report({ event, fields, level, message });

  try {
    const started = await startSynchronizationRun(
      {
        actionId: input.actionId,
        adapterKey: input.adapterKey,
        sourceKey: input.sourceKey,
        sourceName: input.sourceName,
      },
      input.reporter,
    );
    if (started.status === "skipped_already_running") {
      report(
        "warn",
        "Financial synchronization skipped because another run is active",
        "ingestion.run.skipped",
        { reason: started.status },
      );
      return {
        failedConnectionCount: 0,
        partialConnectionCount: 0,
        runId: null,
        status: started.status,
        successfulConnectionCount: 0,
      };
    }

    runId = started.runId;
    report(
      "info",
      "Financial synchronization run started",
      "ingestion.run.started",
      { run_id: runId },
    );
    await identifySynchronizationSource(
      runId,
      await input.source.getExternalSubjectId(),
    );
    const connections = await input.source.listConnections();
    let failedConnectionCount = 0;
    let partialConnectionCount = 0;
    let successfulConnectionCount = 0;

    for (const connection of connections) {
      const startedAt = Date.now();
      try {
        if (
          !connection.active ||
          connection.sourceState !== null ||
          connection.sourceErrorCode !== null
        ) {
          const failure = {
            code:
              connection.sourceErrorCode ??
              connection.sourceState ??
              (connection.active ? null : "inactive"),
            kind: "source_state",
          };
          await recordConnectionFailure(runId, connection, failure);
          failedConnectionCount += 1;
          report(
            "error",
            "Financial connection could not be synchronized",
            "ingestion.connection.failed",
            {
              connection_external_id: connection.externalId,
              duration_ms: Date.now() - startedAt,
              error_code: failure.code,
              error_kind: failure.kind,
              run_id: runId,
            },
          );
          continue;
        }

        const persisted = await recordConnectionResult(
          runId,
          connection,
          await input.source.listAccounts(connection.externalId),
          input.reporter,
        );
        if (persisted.status === "partial") partialConnectionCount += 1;
        else successfulConnectionCount += 1;
        report(
          persisted.status === "partial" ? "warn" : "info",
          persisted.status === "partial"
            ? "Financial connection synchronization completed with missing data"
            : "Financial connection synchronization completed",
          "ingestion.connection.completed",
          {
            connection_external_id: connection.externalId,
            duration_ms: Date.now() - startedAt,
            failed_account_count: persisted.failedAccountCount,
            run_id: runId,
            status: persisted.status,
            successful_account_count: persisted.successfulAccountCount,
          },
        );
      } catch (error) {
        const failure = synchronizationFailureFrom(error);
        await recordConnectionFailure(runId, connection, failure);
        failedConnectionCount += 1;
        report(
          "error",
          "Financial connection synchronization failed",
          "ingestion.connection.failed",
          {
            connection_external_id: connection.externalId,
            duration_ms: Date.now() - startedAt,
            error_code: failure.code,
            error_kind: failure.kind,
            run_id: runId,
          },
        );
      }
    }

    const usefulConnectionCount =
      successfulConnectionCount + partialConnectionCount;
    const status =
      failedConnectionCount === 0 && partialConnectionCount === 0
        ? "succeeded"
        : usefulConnectionCount === 0
          ? "failed"
          : "partial";
    await completeFinancialSynchronization({
      reporter: input.reporter,
      runId,
      status,
    });
    report(
      status === "failed" ? "error" : status === "partial" ? "warn" : "info",
      status === "succeeded"
        ? "Financial synchronization run completed"
        : "Financial synchronization run completed with degraded data",
      "ingestion.run.completed",
      {
        failed_connection_count: failedConnectionCount,
        partial_connection_count: partialConnectionCount,
        run_id: runId,
        status,
        successful_connection_count: successfulConnectionCount,
      },
    );
    return {
      failedConnectionCount,
      partialConnectionCount,
      runId,
      status,
      successfulConnectionCount,
    };
  } catch (error) {
    const failure = synchronizationFailureFrom(error);
    if (runId) {
      try {
        await completeFinancialSynchronization({
          failure,
          reporter: input.reporter,
          runId,
          status: "failed",
        });
      } catch {
        await markSynchronizationRunFailed(runId, failure);
      }
    }
    report(
      "error",
      "Financial synchronization run failed",
      "ingestion.run.failed",
      {
        error_code: failure.code,
        error_kind: failure.kind,
        run_id: runId,
      },
    );
    return {
      failedConnectionCount: 0,
      partialConnectionCount: 0,
      runId,
      status: "failed",
      successfulConnectionCount: 0,
    };
  }
}
