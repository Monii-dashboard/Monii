import type {
  CalculatedWealthSnapshot,
  SnapshotAccountDecision,
} from "../calculate-wealth-snapshot";
import type { WealthOperationalReport } from "../reporting";
import type { WealthSnapshotReason } from "../types";

const incompleteWealthDecisions = new Set([
  "missing_currency",
  "missing_selected_valuation",
  "unknown_account_category",
  "unsupported_currency",
]);

export function wealthSnapshotReports(
  calculated: CalculatedWealthSnapshot,
  input: Readonly<{
    reason: WealthSnapshotReason;
    synchronizationRunId?: string;
  }>,
  snapshotId: string,
): readonly WealthOperationalReport[] {
  const reports: WealthOperationalReport[] = calculated.decisions.flatMap(
    (decision) => {
      const uncertain =
        incompleteWealthDecisions.has(decision.decision) ||
        decision.identityConflict ||
        decision.refreshUncertain;
      if (!uncertain) return [];
      return [{
        event: "wealth.account.evaluated",
        fields: {
          account_category: decision.accountCategory,
          account_id: decision.accountId,
          account_management_mode: decision.accountManagementMode,
          account_purpose: decision.accountPurpose,
          contributed_amount: decision.contributedAmount,
          decision: decision.decision,
          duplicate_adjusted_amount: decision.duplicateAdjustedAmount,
          duplicate_group_id: decision.duplicateGroupId,
          duplicate_role: decision.duplicateRole,
          evaluated_amount: decision.evaluatedAmount,
          evaluated_currency: decision.evaluatedCurrency,
          identity_conflict: decision.identityConflict,
          inclusion_policy: decision.inclusionPolicy,
          refresh_uncertain: decision.refreshUncertain,
          selected_valuation_basis: decision.selectedValuationBasis,
          selected_valuation_method: decision.selectedValuationMethod,
          snapshot_id: snapshotId,
          valuation_candidate_id: decision.evaluatedValuationCandidateId,
        },
        level: "warn" as const,
        message: "Financial account requires attention after wealth evaluation",
      }];
    },
  );

  const decisionsByDuplicateGroup = new Map<
    string,
    SnapshotAccountDecision[]
  >();
  for (const decision of calculated.decisions) {
    if (!decision.duplicateGroupId || decision.duplicateRole === "none") continue;
    decisionsByDuplicateGroup.set(decision.duplicateGroupId, [
      ...(decisionsByDuplicateGroup.get(decision.duplicateGroupId) ?? []),
      decision,
    ]);
  }

  for (const [groupId, decisions] of decisionsByDuplicateGroup) {
    const representative = decisions.find(
      (decision) => decision.duplicateRole === "representative",
    );
    reports.push({
      event: "wealth.duplicate_group.adjusted",
      fields: {
        duplicate_group_id: groupId,
        excluded_account_ids: decisions
          .filter(
            (decision) =>
              decision.duplicateRole === "excluded_from_adjusted_estimate",
          )
          .map((decision) => decision.accountId),
        representative_account_id: representative?.accountId ?? null,
        representative_amount: representative?.duplicateAdjustedAmount ?? null,
        representative_currency: representative?.evaluatedCurrency ?? null,
        selection_rule:
          "latest_effective_at_then_recorded_at_then_lexicographic_account_id",
        snapshot_id: snapshotId,
      },
      level: "warn",
      message: "Likely duplicate group adjusted to one representative account",
    });
  }

  reports.push({
    event: "wealth.snapshot.created",
    fields: {
      contributing_account_count: calculated.contributingAccountCount,
      duplicate_adjusted_estimate_amount:
        calculated.duplicateAdjustedEstimateAmount,
      headline_amount: calculated.headlineAmount,
      is_complete: calculated.isComplete,
      likely_duplicate_group_count: calculated.likelyDuplicateGroupCount,
      missing_account_count: calculated.missingAccountCount,
      reason: input.reason,
      reporting_currency: "EUR",
      snapshot_id: snapshotId,
      synchronization_run_id: input.synchronizationRunId ?? null,
    },
    level: calculated.isComplete ? "info" : "warn",
    message: calculated.isComplete
      ? "Wealth snapshot created"
      : "Incomplete wealth snapshot created",
  });
  return reports;
}
