import { randomUUID } from "node:crypto";

import { getIntegrationDatabase } from "@testkit/postgres";
import {
  snapshotAccountDecisions,
  snapshots,
} from "@monii/postgres/schema";

type NewSnapshot = typeof snapshots.$inferInsert;
type NewSnapshotAccountDecision = typeof snapshotAccountDecisions.$inferInsert;
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
  const [snapshot] = await getIntegrationDatabase()
    .insert(snapshots)
    .values({
      actionId: `test-${causationId}`,
      causationId,
      contributingAccountCount: 1,
      duplicateAdjustedEstimateAmount: "42.00000000",
      headlineAmount: "42.00000000",
      isComplete: true,
      missingAccountCount: 0,
      reason: "account_policy_changed",
      ...overrides,
    })
    .returning();
  if (!snapshot) throw new Error("Failed to insert the wealth snapshot");
  return snapshot;
}

export async function insertSnapshotAccountDecision(
  input: NewSnapshotAccountDecisionInput,
) {
  const [decision] = await getIntegrationDatabase()
    .insert(snapshotAccountDecisions)
    .values({
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
    })
    .returning();
  if (!decision) throw new Error("Failed to insert the snapshot decision");
  return decision;
}
