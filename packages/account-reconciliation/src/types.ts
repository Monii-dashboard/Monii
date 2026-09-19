export type ReconcileAccountsReason =
  | "maintenance"
  | "operator_requested"
  | "synchronization";

export type ReconcileAccountsOutcome = Readonly<{
  changed: boolean;
  clearedLikelyMatchCount: number;
  confirmedMergeCount: number;
  conflictCount: number;
  matchChangeCount: number;
}>;
