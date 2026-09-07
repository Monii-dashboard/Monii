import type { FinancialDomainEvent } from "@monii/accounts";

export type SynchronizationFinalized = FinancialDomainEvent<
  "ingestion.synchronization_finalized",
  { runId: string; status: "failed" | "partial" | "succeeded" }
>;
