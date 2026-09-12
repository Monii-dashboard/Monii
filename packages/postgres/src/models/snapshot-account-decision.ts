import { snapshotAccountDecisions } from "../schema/wealth";
import { modelFor } from "./model";

export class SnapshotAccountDecision extends modelFor(
  snapshotAccountDecisions,
  ["snapshotId", "accountId"] as const,
) {}
