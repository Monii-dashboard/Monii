import {
  decimalFromScaledInteger,
  decimalToScaledInteger,
  type AccountCategory,
  type AccountManagementMode,
  type AccountPurpose,
  type AccountSupportStatus,
  type AccountValuationBasis,
  type AccountValuationCandidate,
  type AccountValuationMethod,
  type DecimalAmount,
  type ExternalAccountLifecycle,
} from "@monii/accounts";

import type { AccountInclusionPolicy } from "./account-policy";

export type SnapshotAccountDecisionCode =
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

export type DuplicateAdjustmentRole =
  | "excluded_from_adjusted_estimate"
  | "none"
  | "representative";

export type AccountWealthCalculationState = Readonly<{
  accountId: string;
  accountName: string | null;
  archivedAt: Date | null;
  balance: AccountValuationCandidate | null;
  category: AccountCategory;
  estimatedValue: AccountValuationCandidate | null;
  externalLifecycle: ExternalAccountLifecycle;
  identityConflict: boolean;
  inclusionPolicy: AccountInclusionPolicy;
  institutionId: string | null;
  institutionName: string | null;
  latestDataRecordedAt: Date | null;
  likelyDuplicateGroupId: string | null;
  managementMode: AccountManagementMode;
  mergedIntoAccountId: string | null;
  purpose: AccountPurpose;
  refreshUncertain: boolean;
  selectedValuationMethod: AccountValuationMethod;
  typeSupport: AccountSupportStatus;
}>;

export type SnapshotAccountDecision = Readonly<{
  accountId: string;
  accountName: string | null;
  accountPurpose: AccountPurpose;
  accountCategory: AccountCategory;
  accountManagementMode: AccountManagementMode;
  contributedAmount: DecimalAmount | null;
  decision: SnapshotAccountDecisionCode;
  duplicateAdjustedAmount: DecimalAmount | null;
  duplicateGroupId: string | null;
  duplicateRole: DuplicateAdjustmentRole;
  evaluatedAmount: DecimalAmount | null;
  evaluatedCurrency: string | null;
  evaluatedValuationCandidateId: string | null;
  identityConflict: boolean;
  inclusionPolicy: AccountInclusionPolicy;
  institutionId: string | null;
  institutionName: string | null;
  latestDataRecordedAt: Date | null;
  refreshUncertain: boolean;
  selectedValuationBasis: AccountValuationBasis | null;
  selectedValuationEffectiveAt: Date | null;
  selectedValuationMethod: AccountValuationMethod;
  selectedValuationRecordedAt: Date | null;
}>;

export type CalculatedWealthSnapshot = Readonly<{
  contributingAccountCount: number;
  decisions: readonly SnapshotAccountDecision[];
  duplicateAdjustedEstimateAmount: DecimalAmount;
  headlineAmount: DecimalAmount;
  isComplete: boolean;
  likelyDuplicateGroupCount: number;
  missingAccountCount: number;
}>;

function selectedBasis(account: AccountWealthCalculationState) {
  if (account.category === "cash") return "balance" as const;
  if (account.category === "investment") return "estimated_value" as const;
  return null;
}

function selectedCandidate(account: AccountWealthCalculationState) {
  const basis = selectedBasis(account);
  if (account.selectedValuationMethod !== "reported") return null;
  return basis === "balance"
    ? account.balance
    : basis === "estimated_value"
      ? account.estimatedValue
      : null;
}

function excludedDecision(
  account: AccountWealthCalculationState,
  decision: SnapshotAccountDecisionCode,
  candidate: AccountValuationCandidate | null = null,
): SnapshotAccountDecision {
  return {
    accountCategory: account.category,
    accountId: account.accountId,
    accountManagementMode: account.managementMode,
    accountName: account.accountName,
    accountPurpose: account.purpose,
    contributedAmount: null,
    decision,
    duplicateAdjustedAmount: null,
    duplicateGroupId: account.likelyDuplicateGroupId,
    duplicateRole: "none",
    evaluatedAmount: candidate?.amount ?? null,
    evaluatedCurrency: candidate?.currency ?? null,
    evaluatedValuationCandidateId: candidate?.valuationCandidateId ?? null,
    identityConflict: account.identityConflict,
    inclusionPolicy: account.inclusionPolicy,
    institutionId: account.institutionId,
    institutionName: account.institutionName,
    latestDataRecordedAt: account.latestDataRecordedAt,
    refreshUncertain: account.refreshUncertain,
    selectedValuationBasis: selectedBasis(account),
    selectedValuationEffectiveAt: candidate?.effectiveAt ?? null,
    selectedValuationMethod: account.selectedValuationMethod,
    selectedValuationRecordedAt: candidate?.recordedAt ?? null,
  };
}

function decideAccount(
  account: AccountWealthCalculationState,
): SnapshotAccountDecision {
  if (account.mergedIntoAccountId) return excludedDecision(account, "excluded_merged");
  if (account.archivedAt) return excludedDecision(account, "excluded_archived");
  if (account.externalLifecycle !== "active") {
    return excludedDecision(account, "excluded_external_lifecycle");
  }
  if (account.inclusionPolicy === "exclude") {
    return excludedDecision(account, "excluded_by_policy");
  }
  if (account.purpose === "business" && account.inclusionPolicy !== "include") {
    return excludedDecision(account, "excluded_business");
  }
  if (account.typeSupport === "known_unsupported") {
    return excludedDecision(account, "known_unsupported_account");
  }
  if (account.category === "unknown" || account.typeSupport === "unrecognized") {
    return excludedDecision(account, "unknown_account_category");
  }

  const candidate = selectedCandidate(account);
  if (!candidate) {
    return excludedDecision(account, "missing_selected_valuation");
  }
  if (!candidate.currency) return excludedDecision(account, "missing_currency", candidate);
  if (candidate.currency !== "EUR") {
    return excludedDecision(account, "unsupported_currency", candidate);
  }

  decimalToScaledInteger(candidate.amount);
  return {
    ...excludedDecision(account, "included", candidate),
    contributedAmount: candidate.amount,
    duplicateAdjustedAmount: candidate.amount,
  };
}

function candidateTime(account: AccountWealthCalculationState) {
  const candidate = selectedCandidate(account);
  return candidate
    ? [
        (candidate.effectiveAt ?? candidate.recordedAt).getTime(),
        candidate.recordedAt.getTime(),
      ]
    : [0, 0];
}

export function calculateWealthSnapshot(
  accounts: readonly AccountWealthCalculationState[],
): CalculatedWealthSnapshot {
  const decisions = accounts.map(decideAccount);
  const groupMap = new Map<string, number[]>();
  accounts.forEach((account, index) => {
    if (!account.likelyDuplicateGroupId || decisions[index]?.decision !== "included") {
      return;
    }
    groupMap.set(account.likelyDuplicateGroupId, [
      ...(groupMap.get(account.likelyDuplicateGroupId) ?? []),
      index,
    ]);
  });

  for (const [groupId, indexes] of groupMap) {
    if (indexes.length < 2) {
      groupMap.delete(groupId);
      continue;
    }
    const representative = [...indexes].sort((left, right) => {
      const leftTime = candidateTime(accounts[left]!);
      const rightTime = candidateTime(accounts[right]!);
      return (
        rightTime[0]! - leftTime[0]! ||
        rightTime[1]! - leftTime[1]! ||
        accounts[left]!.accountId.localeCompare(accounts[right]!.accountId)
      );
    })[0]!;
    for (const index of indexes) {
      const decision = decisions[index]!;
      decisions[index] = {
        ...decision,
        duplicateAdjustedAmount:
          index === representative ? decision.contributedAmount : null,
        duplicateRole:
          index === representative
            ? "representative"
            : "excluded_from_adjusted_estimate",
      };
    }
  }

  const contributing = decisions.filter((item) => item.decision === "included");
  const incomplete = decisions.filter((item) =>
    [
      "missing_currency",
      "missing_selected_valuation",
      "unknown_account_category",
      "unsupported_currency",
    ].includes(item.decision),
  );
  const headline = contributing.reduce(
    (sum, item) => sum + decimalToScaledInteger(item.contributedAmount!),
    0n,
  );
  const adjusted = contributing.reduce(
    (sum, item) =>
      sum +
      (item.duplicateAdjustedAmount
        ? decimalToScaledInteger(item.duplicateAdjustedAmount)
        : 0n),
    0n,
  );
  const hasUncertainty = decisions.some(
    (item) =>
      !["excluded_archived", "excluded_merged"].includes(item.decision) &&
      (item.identityConflict || item.refreshUncertain),
  );

  return {
    contributingAccountCount: contributing.length,
    decisions,
    duplicateAdjustedEstimateAmount: decimalFromScaledInteger(adjusted),
    headlineAmount: decimalFromScaledInteger(headline),
    isComplete:
      incomplete.length === 0 && groupMap.size === 0 && !hasUncertainty,
    likelyDuplicateGroupCount: groupMap.size,
    missingAccountCount: incomplete.length,
  };
}
