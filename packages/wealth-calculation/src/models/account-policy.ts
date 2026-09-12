import { modelFor } from "@monii/postgres/model";
import { accountPolicies } from "@monii/postgres/schema/wealth";

export class AccountPolicy extends modelFor(
  accountPolicies,
  ["accountId"] as const,
) {}
