import { modelFor } from "@monii/postgres/model";
import { accountMerges } from "@monii/postgres/schema/financial";

export class AccountMerge extends modelFor(
  accountMerges,
  ["mergedAccountId"] as const,
) {}
