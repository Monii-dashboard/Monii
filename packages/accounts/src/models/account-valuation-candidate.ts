import { modelFor } from "@monii/postgres/model";
import { accountValuationCandidates } from "@monii/postgres/schema/financial";

export class AccountValuationCandidate extends modelFor(
  accountValuationCandidates,
) {}
