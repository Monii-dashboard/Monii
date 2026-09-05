import type { AccountIdentityEvidence } from "./account-identity";
import type {
  AccountKind,
  AccountUsage,
  DecimalAmount,
  SourceLifecycle,
  SyncStatus,
} from "./wealth";

export type NormalizedInstitution = Readonly<{
  externalId: string;
  name: string;
}>;

export type NormalizedConnection = Readonly<{
  active: boolean;
  externalId: string;
  institution: NormalizedInstitution;
  nextTryAt: Date | null;
  sourceErrorCode: string | null;
  sourceState: string | null;
  sourceUpdatedAt: Date | null;
}>;

export type NormalizedAccount = Readonly<{
  balance: DecimalAmount | null;
  currency: string | null;
  estimatedValue: DecimalAmount | null;
  externalId: string;
  identity: AccountIdentityEvidence;
  kind: AccountKind;
  lifecycle: SourceLifecycle;
  name: string;
  sourceType: string | null;
  sourceValidAt: Date | null;
  usage: AccountUsage;
}>;

export type SyncFailure = Readonly<{
  code: string | null;
  kind: string;
}>;

export type NormalizedAccountFailure = Readonly<{
  externalId: string | null;
  failure: SyncFailure;
}>;

export type NormalizedAccountListing = Readonly<{
  accounts: readonly NormalizedAccount[];
  failures: readonly NormalizedAccountFailure[];
  isComplete: boolean;
  reportedTotal: number | null;
}>;

export type FinancialSource = Readonly<{
  getExternalSubjectId(): Promise<string>;
  listAccounts(connectionExternalId: string): Promise<NormalizedAccountListing>;
  listConnections(): Promise<readonly NormalizedConnection[]>;
}>;

export type ConnectionPersistenceResult = Readonly<{
  failedAccountCount: number;
  status: "partial" | "succeeded";
  successfulAccountCount: number;
}>;

export type SynchronizationRepository = Readonly<{
  finalizeRun(
    runId: string,
    status: Exclude<SyncStatus, "running">,
    failure?: SyncFailure,
  ): Promise<void>;
  identifyRunSource(runId: string, externalSubjectId: string): Promise<void>;
  markRunFailed(runId: string, failure: SyncFailure): Promise<void>;
  recordConnectionFailure(
    runId: string,
    connection: NormalizedConnection,
    failure: SyncFailure,
  ): Promise<void>;
  recordConnectionResult(
    runId: string,
    connection: NormalizedConnection,
    listing: NormalizedAccountListing,
  ): Promise<ConnectionPersistenceResult>;
  startRun(input: Readonly<{
    actionId: string;
    sourceKey: string;
    sourceKind: string;
    sourceName: string;
  }>): Promise<
    | Readonly<{ runId: string; status: "started" }>
    | Readonly<{ status: "skipped_already_running" }>
  >;
}>;

export type SynchronizationReporter = Readonly<{
  report(event: string, fields?: Readonly<Record<string, unknown>>): void;
}>;

export type SynchronizationResult = Readonly<{
  failedConnectionCount: number;
  partialConnectionCount: number;
  runId: string | null;
  status: Exclude<SyncStatus, "running"> | "skipped_already_running";
  successfulConnectionCount: number;
}>;

export function failureFrom(error: unknown): SyncFailure {
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
  reporter?: SynchronizationReporter;
  repository: SynchronizationRepository;
  source: FinancialSource;
  sourceKey: string;
  sourceKind: string;
  sourceName: string;
}>): Promise<SynchronizationResult> {
  let runId: string | null = null;
  const report = (event: string, fields?: Readonly<Record<string, unknown>>) =>
    input.reporter?.report(event, fields);

  try {
    const started = await input.repository.startRun({
      actionId: input.actionId,
      sourceKey: input.sourceKey,
      sourceKind: input.sourceKind,
      sourceName: input.sourceName,
    });
    if (started.status === "skipped_already_running") {
      report("sync.skipped", { reason: started.status });
      return {
        failedConnectionCount: 0,
        partialConnectionCount: 0,
        runId: null,
        status: started.status,
        successfulConnectionCount: 0,
      };
    }

    runId = started.runId;
    report("sync.run_started", { run_id: runId });
    const externalSubjectId = await input.source.getExternalSubjectId();
    await input.repository.identifyRunSource(runId, externalSubjectId);
    const connections = await input.source.listConnections();
    report("sync.connections_discovered", {
      connection_count: connections.length,
      run_id: runId,
    });
    let failedConnectionCount = 0;
    let partialConnectionCount = 0;
    let successfulConnectionCount = 0;

    for (const connection of connections) {
      const startedAt = Date.now();
      report("sync.connection_started", {
        connection_external_id: connection.externalId,
        run_id: runId,
      });
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
          await input.repository.recordConnectionFailure(runId, connection, failure);
          failedConnectionCount += 1;
          report("sync.connection_failed", {
            connection_external_id: connection.externalId,
            duration_ms: Date.now() - startedAt,
            error_code: failure.code,
            error_kind: failure.kind,
            run_id: runId,
          });
          continue;
        }

        const listing = await input.source.listAccounts(connection.externalId);
        const persisted = await input.repository.recordConnectionResult(
          runId,
          connection,
          listing,
        );
        if (persisted.status === "partial") partialConnectionCount += 1;
        else successfulConnectionCount += 1;
        report("sync.connection_completed", {
          connection_external_id: connection.externalId,
          duration_ms: Date.now() - startedAt,
          failed_account_count: persisted.failedAccountCount,
          run_id: runId,
          status: persisted.status,
          successful_account_count: persisted.successfulAccountCount,
        });
      } catch (error) {
        const failure = failureFrom(error);
        await input.repository.recordConnectionFailure(runId, connection, failure);
        failedConnectionCount += 1;
        report("sync.connection_failed", {
          connection_external_id: connection.externalId,
          duration_ms: Date.now() - startedAt,
          error_code: failure.code,
          error_kind: failure.kind,
          run_id: runId,
        });
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
    await input.repository.finalizeRun(runId, status);
    report("sync.finalized", {
      failed_connection_count: failedConnectionCount,
      partial_connection_count: partialConnectionCount,
      run_id: runId,
      status,
      successful_connection_count: successfulConnectionCount,
    });

    return {
      failedConnectionCount,
      partialConnectionCount,
      runId,
      status,
      successfulConnectionCount,
    };
  } catch (error) {
    const failure = failureFrom(error);
    if (runId) {
      try {
        await input.repository.finalizeRun(runId, "failed", failure);
      } catch {
        await input.repository.markRunFailed(runId, failure);
      }
    }
    report("sync.failed", {
      error_code: failure.code,
      error_kind: failure.kind,
      run_id: runId,
    });

    return {
      failedConnectionCount: 0,
      partialConnectionCount: 0,
      runId,
      status: "failed",
      successfulConnectionCount: 0,
    };
  }
}
