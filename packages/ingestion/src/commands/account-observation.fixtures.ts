import type {
  ExternalFinancialSource,
  NormalizedExternalAccount,
  NormalizedExternalConnection,
} from "../external-financial-source";

export const observedAt = new Date("2026-08-31T10:00:00Z");

export function account(
  externalId: string,
  amount: string,
  overrides: Partial<NormalizedExternalAccount> = {},
): NormalizedExternalAccount {
  return {
    balance: amount,
    category: "cash",
    currency: "EUR",
    estimatedValue: null,
    externalId,
    identity: {
      accountNumberFingerprint: null,
      ibanFingerprint: `iban-${externalId}`,
      keyVersion: "v1",
      reportedNameFingerprint: `name-${externalId}`,
    },
    lifecycle: "active",
    purpose: "personal",
    rawCurrency: "eur",
    reportedName: "Checking",
    reportedType: "checking",
    sourceValidAt: observedAt,
    typeSupport: "supported",
    ...overrides,
  };
}

function connection(
  externalId: string,
  institutionId = "institution-shared",
): NormalizedExternalConnection {
  return {
    active: true,
    externalId,
    institution: { externalId: institutionId, reportedName: "Example Bank" },
    nextTryAt: null,
    sourceErrorCode: null,
    sourceState: null,
    sourceUpdatedAt: observedAt,
  };
}

export function source(
  accountsByConnection: Readonly<
    Record<string, readonly NormalizedExternalAccount[]>
  >,
): ExternalFinancialSource {
  return {
    getExternalSubjectId: async () => "subject-1",
    listAccounts: async (connectionId) => ({
      accounts: accountsByConnection[connectionId] ?? [],
      failures: [],
      isComplete: true,
      reportedTotal: accountsByConnection[connectionId]?.length ?? 0,
    }),
    listConnections: async () =>
      Object.keys(accountsByConnection).map((id) => connection(id)),
  };
}
