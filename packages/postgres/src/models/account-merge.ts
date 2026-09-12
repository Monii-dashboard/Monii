import { accountMerges } from "../schema/financial";
import { modelFor } from "./model";

export class AccountMerge extends modelFor(
  accountMerges,
  ["mergedAccountId"] as const,
) {}
