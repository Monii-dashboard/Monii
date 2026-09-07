import type {
  AccountCategory,
  AccountPurpose,
  AccountSupportStatus,
  DecimalAmount,
  ExternalAccountLifecycle,
} from "@monii/accounts";

import type { AccountIdentityEvidence } from "./account-identity";

export type ExternalAccountTypeSupport = AccountSupportStatus;

export type NormalizedExternalInstitution = Readonly<{
  externalId: string;
  reportedName: string | null;
}>;

export type NormalizedExternalConnection = Readonly<{
  active: boolean;
  externalId: string;
  institution: NormalizedExternalInstitution;
  nextTryAt: Date | null;
  sourceErrorCode: string | null;
  sourceState: string | null;
  sourceUpdatedAt: Date | null;
}>;

export type NormalizedExternalAccount = Readonly<{
  balance: DecimalAmount | null;
  category: AccountCategory;
  currency: string | null;
  estimatedValue: DecimalAmount | null;
  externalId: string;
  identity: AccountIdentityEvidence;
  lifecycle: ExternalAccountLifecycle;
  purpose: AccountPurpose;
  rawCurrency: string | null;
  reportedName: string | null;
  reportedType: string | null;
  sourceValidAt: Date | null;
  typeSupport: ExternalAccountTypeSupport;
}>;

export type SynchronizationFailure = Readonly<{
  code: string | null;
  kind: string;
}>;

export type NormalizedExternalAccountFailure = Readonly<{
  externalId: string | null;
  failure: SynchronizationFailure;
}>;

export type NormalizedExternalAccountListing = Readonly<{
  accounts: readonly NormalizedExternalAccount[];
  failures: readonly NormalizedExternalAccountFailure[];
  isComplete: boolean;
  reportedTotal: number | null;
}>;

export type ExternalFinancialSource = Readonly<{
  getExternalSubjectId(): Promise<string>;
  listAccounts(
    connectionExternalId: string,
  ): Promise<NormalizedExternalAccountListing>;
  listConnections(): Promise<readonly NormalizedExternalConnection[]>;
}>;
