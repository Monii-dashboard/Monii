import { randomUUID } from "node:crypto";

import {
  SnapshotAccountDecision,
  WealthSnapshot,
} from "@monii/postgres/models";

type NewSnapshot = Parameters<typeof WealthSnapshot.create>[0];
type NewSnapshotAccountDecision = Parameters<
  typeof SnapshotAccountDecision.create
>[0];
type NewSnapshotAccountDecisionInput = Pick<
  NewSnapshotAccountDecision,
  "accountId" | "evaluatedValuationCandidateId" | "snapshotId"
> & Partial<Omit<
  NewSnapshotAccountDecision,
  "accountId" | "evaluatedValuationCandidateId" | "snapshotId"
>>;

export async function insertSnapshot(
  overrides: Partial<NewSnapshot> = {},
) {
  const causationId = randomUUID();
  return WealthSnapshot.create({
    actionId: `test-${causationId}`,
    causationId,
    contributingAccountCount: 1,
    duplicateAdjustedEstimateAmount: "42.00000000",
    headlineAmount: "42.00000000",
    isComplete: true,
    missingAccountCount: 0,
    reason: "account_policy_changed",
    ...overrides,
  });
}

export async function insertSnapshotAccountDecision(
  input: NewSnapshotAccountDecisionInput,
) {
  return SnapshotAccountDecision.create({
    accountCategory: "cash",
    accountManagementMode: "external",
    accountName: "Test account",
    accountPurpose: "personal",
    contributedAmount: "42.00000000",
    decision: "included",
    duplicateAdjustedAmount: "42.00000000",
    evaluatedAmount: "42.00000000",
    evaluatedCurrency: "EUR",
    inclusionPolicy: "automatic",
    institutionName: "Test institution",
    selectedValuationBasis: "balance",
    selectedValuationMethod: "reported",
    ...input,
  });
}
