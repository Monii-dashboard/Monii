import type {
  NormalizedExternalAccount,
  NormalizedExternalConnection,
} from "@monii/ingestion";

const observedAt = new Date("2026-08-31T10:00:00Z");

export function fakeExternalAccount(
  overrides: Partial<NormalizedExternalAccount> = {},
): NormalizedExternalAccount {
  const externalId = overrides.externalId ?? "test-account";
  return {
    balance: "42.00000000",
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
    reportedName: "Test account",
    reportedType: "checking",
    sourceValidAt: observedAt,
    typeSupport: "supported",
    ...overrides,
  };
}

export function fakeExternalConnection(
  overrides: Partial<NormalizedExternalConnection> = {},
): NormalizedExternalConnection {
  return {
    active: true,
    externalId: "test-connection",
    institution: {
      externalId: "test-institution",
      reportedName: "Test institution",
    },
    nextTryAt: null,
    sourceErrorCode: null,
    sourceState: null,
    sourceUpdatedAt: observedAt,
    ...overrides,
  };
}
