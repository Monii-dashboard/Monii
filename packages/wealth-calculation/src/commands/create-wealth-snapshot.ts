import {
  SynchronizationRun,
} from "@monii/ingestion/models";
import { afterCommit, transaction } from "@monii/postgres/transaction";

import { SnapshotAccountDecision, WealthSnapshot } from "../models";

import { calculateWealthSnapshot } from "../calculate-wealth-snapshot";
import type { WealthReporter } from "../reporting";
import type { WealthSnapshotReason } from "../types";
import { loadAccountCalculationStates } from "../internal/load-account-calculation-states";
import { wealthSnapshotReports } from "../internal/wealth-snapshot-reports";

export type CreateWealthSnapshotInput = Readonly<{
  actionId: string;
  causationId: string;
  reason: WealthSnapshotReason;
  synchronizationRunId?: string;
}>;

export async function createWealthSnapshot(
  input: CreateWealthSnapshotInput,
  reporter?: WealthReporter,
): Promise<string> {
  return transaction(async () => {
    const policyCalculation = calculateWealthSnapshot(
      await loadAccountCalculationStates(),
    );
    const latestRun = await SynchronizationRun.query("latest_status").loadOne();
    const calculated = {
      ...policyCalculation,
      isComplete:
        policyCalculation.isComplete &&
        (latestRun === null || latestRun.status === "succeeded"),
    };
    const snapshot = await WealthSnapshot.create({
      actionId: input.actionId,
      causationId: input.causationId,
      contributingAccountCount: calculated.contributingAccountCount,
      duplicateAdjustedEstimateAmount:
        calculated.duplicateAdjustedEstimateAmount,
      headlineAmount: calculated.headlineAmount,
      isComplete: calculated.isComplete,
      likelyDuplicateGroupCount: calculated.likelyDuplicateGroupCount,
      missingAccountCount: calculated.missingAccountCount,
      reason: input.reason,
      recordedAt: new Date(),
      synchronizationRunId: input.synchronizationRunId,
    });

    for (const decision of calculated.decisions) {
      await SnapshotAccountDecision.create({
        accountCategory: decision.accountCategory,
        accountId: decision.accountId,
        accountManagementMode: decision.accountManagementMode,
        accountName: decision.accountName,
        accountPurpose: decision.accountPurpose,
        contributedAmount: decision.contributedAmount,
        decision: decision.decision,
        duplicateAdjustedAmount: decision.duplicateAdjustedAmount,
        duplicateGroupId: decision.duplicateGroupId,
        duplicateRole: decision.duplicateRole,
        evaluatedAmount: decision.evaluatedAmount,
        evaluatedCurrency: decision.evaluatedCurrency,
        evaluatedValuationCandidateId: decision.evaluatedValuationCandidateId,
        identityConflict: decision.identityConflict,
        inclusionPolicy: decision.inclusionPolicy,
        institutionId: decision.institutionId,
        institutionName: decision.institutionName,
        latestDataRecordedAt: decision.latestDataRecordedAt,
        refreshUncertain: decision.refreshUncertain,
        selectedValuationBasis: decision.selectedValuationBasis,
        selectedValuationEffectiveAt: decision.selectedValuationEffectiveAt,
        selectedValuationMethod: decision.selectedValuationMethod,
        selectedValuationRecordedAt: decision.selectedValuationRecordedAt,
        snapshotId: snapshot.id,
      });
    }

    const reports = wealthSnapshotReports(calculated, input, snapshot.id);
    for (const report of reports) {
      afterCommit(() => reporter?.report(report));
    }
    return snapshot.id;
  });
}
