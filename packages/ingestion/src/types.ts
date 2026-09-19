export type SynchronizationStatus =
  | "failed"
  | "partial"
  | "running"
  | "succeeded";

export type ConnectionPersistenceResult = Readonly<{
  failedAccountCount: number;
  status: "partial" | "succeeded";
  successfulAccountCount: number;
}>;

export type SynchronizationResult = Readonly<{
  failedConnectionCount: number;
  partialConnectionCount: number;
  runId: string | null;
  status:
    | Exclude<SynchronizationStatus, "running">
    | "skipped_already_running";
  successfulConnectionCount: number;
}>;
