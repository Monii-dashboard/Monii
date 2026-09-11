import {
  accountMerges,
  accounts,
  accountValuationCandidates,
  institutions,
} from "../schema/financial";
import { modelFor } from "./model";

export class Institution extends modelFor(institutions, ["id"] as const) {
  static archive(id: string, archivedAt = new Date()) {
    return this.update(id, { archivedAt, updatedAt: archivedAt });
  }
}

export class Account extends modelFor(accounts, ["id"] as const) {
  static archive(id: string, archivedAt = new Date()) {
    return this.update(id, { archivedAt, updatedAt: archivedAt });
  }
}

export class AccountMerge extends modelFor(
  accountMerges,
  ["mergedAccountId"] as const,
) {}

export class AccountValuationCandidate extends modelFor(
  accountValuationCandidates,
  ["id"] as const,
) {}
