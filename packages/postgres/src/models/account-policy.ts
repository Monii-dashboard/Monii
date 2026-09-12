import { accountPolicies } from "../schema/wealth";
import { modelFor } from "./model";

export class AccountPolicy extends modelFor(
  accountPolicies,
  ["accountId"] as const,
) {}
