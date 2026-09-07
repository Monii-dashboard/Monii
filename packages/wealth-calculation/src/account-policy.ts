import type { AccountValuationMethod } from "@monii/accounts";

export type AccountInclusionPolicy = "automatic" | "exclude" | "include";

export type AccountWealthPolicy = Readonly<{
  accountId: string;
  inclusionPolicy: AccountInclusionPolicy;
  selectedValuationMethod: AccountValuationMethod;
}>;
