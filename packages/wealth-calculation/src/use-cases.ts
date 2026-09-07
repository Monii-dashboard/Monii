import type { AccountInclusionPolicy } from "./account-policy";

export type WealthSnapshotReason = "account_policy_changed" | "synchronization";

export type WealthCalculationRepository = Readonly<{
  changeAccountInclusionPolicy(input: Readonly<{
    accountId: string;
    actionId: string;
    inclusionPolicy: AccountInclusionPolicy;
  }>): Promise<boolean>;
}>;

export function changeAccountInclusionPolicy(
  repository: WealthCalculationRepository,
  input: Readonly<{
    accountId: string;
    actionId: string;
    inclusionPolicy: AccountInclusionPolicy;
  }>,
): Promise<boolean> {
  return repository.changeAccountInclusionPolicy(input);
}
