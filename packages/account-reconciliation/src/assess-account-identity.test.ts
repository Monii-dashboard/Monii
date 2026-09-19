import { describe, expect, test } from "vitest";

import {
  assessExternalAccountIdentity,
  type IdentityAccount,
} from "./assess-account-identity";

function identity(overrides: Partial<IdentityAccount> = {}): IdentityAccount {
  return {
    accountId: "account-1",
    category: "cash",
    currency: "EUR",
    evidence: {
      accountNumberFingerprint: "number-1",
      ibanFingerprint: "iban-1",
      keyVersion: "v1",
      reportedNameFingerprint: "name-1",
    },
    externalAccountId: "external-1",
    institutionId: "bank-1",
    ...overrides,
  };
}

describe("external account identity policy", () => {
  test("confirms stable identity but separates currency pockets", () => {
    expect(
      assessExternalAccountIdentity(
        identity(),
        identity({ accountId: "account-2", externalAccountId: "external-2" }),
      ).classification,
    ).toBe("confirmed_duplicate");
    expect(
      assessExternalAccountIdentity(
        identity(),
        identity({
          accountId: "usd",
          currency: "USD",
          externalAccountId: "external-usd",
        }),
      ).classification,
    ).toBe("distinct");
  });

  test("uses mutable names only to suggest a likely duplicate", () => {
    expect(
      assessExternalAccountIdentity(
        identity({ evidence: { ...identity().evidence, ibanFingerprint: null } }),
        identity({
          accountId: "account-2",
          evidence: {
            ...identity().evidence,
            accountNumberFingerprint: null,
            ibanFingerprint: null,
          },
          externalAccountId: "external-2",
        }),
      ).classification,
    ).toBe("likely_duplicate");
  });

  test("returns stable reason codes for missing, conflicting, and insufficient evidence", () => {
    expect(
      assessExternalAccountIdentity(
        identity({ category: "unknown", currency: null, institutionId: null }),
        identity({
          accountId: "account-2",
          evidence: { ...identity().evidence, keyVersion: "v2" },
          externalAccountId: "external-2",
        }),
      ),
    ).toEqual({
      classification: "distinct",
      reasonCodes: [
        "missing_institution",
        "missing_currency",
        "unknown_account_category",
        "fingerprint_key_version_mismatch",
      ],
    });
    expect(
      assessExternalAccountIdentity(
        identity(),
        identity({
          accountId: "account-2",
          evidence: {
            ...identity().evidence,
            accountNumberFingerprint: "different-number",
            ibanFingerprint: "different-iban",
          },
          externalAccountId: "external-2",
        }),
      ).reasonCodes,
    ).toEqual(["conflicting_iban", "conflicting_account_number"]);
    expect(
      assessExternalAccountIdentity(
        identity({
          evidence: {
            ...identity().evidence,
            accountNumberFingerprint: null,
            ibanFingerprint: null,
            reportedNameFingerprint: null,
          },
        }),
        identity({
          accountId: "account-2",
          evidence: {
            ...identity().evidence,
            accountNumberFingerprint: null,
            ibanFingerprint: null,
            reportedNameFingerprint: null,
          },
          externalAccountId: "external-2",
        }),
      ).reasonCodes,
    ).toEqual(["insufficient_matching_evidence"]);
  });
});
