import { accountValuationCandidates } from "../schema/financial";
import { modelFor } from "./model";

export class AccountValuationCandidate extends modelFor(
  accountValuationCandidates,
  ["id"] as const,
) {}
