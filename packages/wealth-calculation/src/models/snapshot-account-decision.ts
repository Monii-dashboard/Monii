import { modelFor } from "@monii/postgres/model";
import { snapshotAccountDecisions } from "@monii/postgres/schema/wealth";

export class SnapshotAccountDecision extends modelFor(
  snapshotAccountDecisions,
  ["snapshotId", "accountId"] as const,
) {}
