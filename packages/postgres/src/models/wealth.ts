import {
  accountPolicies,
  snapshotAccountDecisions,
  snapshots,
} from "../schema/wealth";
import { modelFor } from "./model";

export class AccountPolicy extends modelFor(
  accountPolicies,
  ["accountId"] as const,
) {}

export class WealthSnapshot extends modelFor(snapshots, ["id"] as const) {}

export class SnapshotAccountDecision extends modelFor(
  snapshotAccountDecisions,
  ["snapshotId", "accountId"] as const,
) {}
