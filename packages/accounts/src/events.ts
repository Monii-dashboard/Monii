export type FinancialDomainEvent<TType extends string, TPayload> = Readonly<{
  actionId: string;
  eventId: string;
  occurredAt: Date;
  payload: Readonly<TPayload>;
  type: TType;
}>;

export type AccountCreated = FinancialDomainEvent<
  "accounts.account_created",
  { accountId: string }
>;

export type AccountsMerged = FinancialDomainEvent<
  "accounts.accounts_merged",
  { canonicalAccountId: string; mergedAccountIds: readonly string[] }
>;
