import type { AccountCategory } from "@monii/accounts";
import {
  SnapshotAccountDecision,
  SynchronizationRun,
  WealthSnapshot,
} from "@monii/postgres/models";

import type {
  CurrentWealthState,
  LatestSynchronizationStatus,
  StoredWealthSnapshot,
} from "../current-wealth";

export async function loadCurrentWealthState(): Promise<CurrentWealthState> {
  const snapshot = await WealthSnapshot.query("latest").loadOne();
  const latestRun = await SynchronizationRun.query("latest_status").loadOne();
  const lastSuccessfulRun = await SynchronizationRun.query(
    "last_successful_completion",
  ).loadOne();
  if (!snapshot) {
    return {
      lastSuccessfulSynchronizationAt: lastSuccessfulRun?.finishedAt ?? null,
      latestSynchronizationStatus:
        (latestRun?.status as LatestSynchronizationStatus | undefined) ?? null,
      snapshot: null,
    };
  }

  const decisions = await SnapshotAccountDecision.findMany({
    snapshotId: snapshot.id,
  });
  const stored: StoredWealthSnapshot = {
    accounts: decisions.map((decision) => ({
      accountId: decision.accountId,
      accountName: decision.accountName,
      adjustedAmount: decision.duplicateAdjustedAmount,
      category: decision.accountCategory as AccountCategory,
      contributedAmount: decision.contributedAmount,
      decision:
        decision.decision as StoredWealthSnapshot["accounts"][number]["decision"],
      duplicateRole:
        decision.duplicateRole as StoredWealthSnapshot["accounts"][number]["duplicateRole"],
      evaluatedAmount: decision.evaluatedAmount,
      evaluatedCurrency: decision.evaluatedCurrency,
      identityConflict: decision.identityConflict,
      institutionId: decision.institutionId,
      institutionName: decision.institutionName,
      refreshUncertain: decision.refreshUncertain,
      valuationEffectiveAt: decision.selectedValuationEffectiveAt,
      valuationRecordedAt: decision.selectedValuationRecordedAt,
    })),
    duplicateAdjustedEstimateAmount: snapshot.duplicateAdjustedEstimateAmount,
    headlineAmount: snapshot.headlineAmount,
    isComplete: snapshot.isComplete,
    likelyDuplicateGroupCount: snapshot.likelyDuplicateGroupCount,
    recordedAt: snapshot.recordedAt,
    snapshotId: snapshot.id,
  };
  return {
    lastSuccessfulSynchronizationAt: lastSuccessfulRun?.finishedAt ?? null,
    latestSynchronizationStatus:
      (latestRun?.status as LatestSynchronizationStatus | undefined) ?? null,
    snapshot: stored,
  };
}
