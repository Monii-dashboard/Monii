import {
  decimalFromScaledInteger,
  decimalToScaledInteger,
  type AccountCategory,
  type DecimalAmount,
} from "@monii/accounts";
export type WealthHealth = "fresh" | "stale" | "synchronization_failed";
export type LatestSynchronizationStatus =
  | "failed"
  | "partial"
  | "running"
  | "succeeded";
export type StoredSnapshotDecision =
  | "excluded_archived"
  | "excluded_business"
  | "excluded_by_policy"
  | "excluded_external_lifecycle"
  | "excluded_merged"
  | "included"
  | "known_unsupported_account"
  | "missing_currency"
  | "missing_selected_valuation"
  | "unknown_account_category"
  | "unsupported_currency";
export type StoredDuplicateAdjustmentRole =
  | "excluded_from_adjusted_estimate"
  | "none"
  | "representative";

export type StoredSnapshotAccount = Readonly<{
  accountId: string;
  accountName: string | null;
  adjustedAmount: DecimalAmount | null;
  category: AccountCategory;
  contributedAmount: DecimalAmount | null;
  decision: StoredSnapshotDecision;
  duplicateRole: StoredDuplicateAdjustmentRole;
  evaluatedAmount: DecimalAmount | null;
  evaluatedCurrency: string | null;
  identityConflict: boolean;
  institutionId: string | null;
  institutionName: string | null;
  refreshUncertain: boolean;
  valuationEffectiveAt: Date | null;
  valuationRecordedAt: Date | null;
}>;

export type StoredWealthSnapshot = Readonly<{
  accounts: readonly StoredSnapshotAccount[];
  duplicateAdjustedEstimateAmount: DecimalAmount;
  headlineAmount: DecimalAmount;
  isComplete: boolean;
  likelyDuplicateGroupCount: number;
  recordedAt: Date;
  snapshotId: string;
}>;

export type CurrentWealthState = Readonly<{
  lastSuccessfulSynchronizationAt: Date | null;
  latestSynchronizationStatus: LatestSynchronizationStatus | null;
  snapshot: StoredWealthSnapshot | null;
}>;

export type CurrentAccountWealth = StoredSnapshotAccount &
  Readonly<{ health: WealthHealth | null; name: string }>;

export type CurrentInstitutionWealth = Readonly<{
  accounts: readonly CurrentAccountWealth[];
  contributedAmount: DecimalAmount;
  institutionId: string | null;
  name: string;
}>;

export type CurrentWealth = Readonly<{
  currency: "EUR";
  duplicateAdjustedEstimateAmount: DecimalAmount;
  headlineAmount: DecimalAmount;
  health: WealthHealth;
  institutions: readonly CurrentInstitutionWealth[];
  isComplete: boolean;
  lastSuccessfulSynchronizationAt: Date | null;
  latestSynchronizationStatus: LatestSynchronizationStatus | null;
  likelyDuplicateGroupCount: number;
  possibleTotalMaximum: DecimalAmount;
  possibleTotalMinimum: DecimalAmount;
  recordedAt: Date | null;
}>;

const STALE_AFTER_MILLISECONDS = 48 * 60 * 60 * 1_000;

export function buildCurrentWealthView(
  state: CurrentWealthState,
  now: Date,
): CurrentWealth {
  if (!state.snapshot) {
    return {
      currency: "EUR",
      duplicateAdjustedEstimateAmount: "0",
      headlineAmount: "0",
      health:
        state.latestSynchronizationStatus === "failed"
          ? "synchronization_failed"
          : "fresh",
      institutions: [],
      isComplete: false,
      lastSuccessfulSynchronizationAt: state.lastSuccessfulSynchronizationAt,
      latestSynchronizationStatus: state.latestSynchronizationStatus,
      likelyDuplicateGroupCount: 0,
      possibleTotalMaximum: "0",
      possibleTotalMinimum: "0",
      recordedAt: null,
    };
  }

  const accounts = state.snapshot.accounts.map((account): CurrentAccountWealth => {
    const valueTime = account.valuationEffectiveAt ?? account.valuationRecordedAt;
    const health: WealthHealth | null =
      account.decision !== "included"
        ? null
        : account.refreshUncertain
          ? "synchronization_failed"
          : valueTime && now.getTime() - valueTime.getTime() > STALE_AFTER_MILLISECONDS
            ? "stale"
            : "fresh";
    return {
      ...account,
      health,
      name: account.accountName ?? "Unnamed account",
    };
  });
  const health = state.latestSynchronizationStatus === "failed" ||
    accounts.some((account) => account.health === "synchronization_failed")
    ? "synchronization_failed"
    : accounts.some((account) => account.health === "stale")
      ? "stale"
      : "fresh";
  const institutions = new Map<string, CurrentInstitutionWealth>();
  for (const account of accounts) {
    const key = account.institutionId ?? "unassigned";
    const current = institutions.get(key);
    const currentContribution = decimalToScaledInteger(
      current?.contributedAmount ?? "0",
    );
    const accountContribution = account.contributedAmount
      ? decimalToScaledInteger(account.contributedAmount)
      : 0n;
    institutions.set(key, {
      accounts: [...(current?.accounts ?? []), account],
      contributedAmount: decimalFromScaledInteger(
        currentContribution + accountContribution,
      ),
      institutionId: account.institutionId,
      name: account.institutionName ?? "Unknown institution",
    });
  }
  const headline = decimalToScaledInteger(state.snapshot.headlineAmount);
  const adjusted = decimalToScaledInteger(
    state.snapshot.duplicateAdjustedEstimateAmount,
  );
  return {
    currency: "EUR",
    duplicateAdjustedEstimateAmount:
      state.snapshot.duplicateAdjustedEstimateAmount,
    headlineAmount: state.snapshot.headlineAmount,
    health,
    institutions: [...institutions.values()],
    isComplete: state.snapshot.isComplete,
    lastSuccessfulSynchronizationAt: state.lastSuccessfulSynchronizationAt,
    latestSynchronizationStatus: state.latestSynchronizationStatus,
    likelyDuplicateGroupCount: state.snapshot.likelyDuplicateGroupCount,
    possibleTotalMaximum: decimalFromScaledInteger(
      headline > adjusted ? headline : adjusted,
    ),
    possibleTotalMinimum: decimalFromScaledInteger(
      headline < adjusted ? headline : adjusted,
    ),
    recordedAt: state.snapshot.recordedAt,
  };
}
