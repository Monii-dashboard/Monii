import type { AccountValuationCandidate } from "@monii/accounts";
import { describe, expect, test } from "vitest";

import {
  calculateWealthSnapshot,
  type AccountWealthCalculationState,
} from "./calculate-wealth-snapshot";

const observedAt = new Date("2026-08-30T12:00:00Z");

function candidate(
  amount = "100.25",
  overrides: Partial<AccountValuationCandidate> = {},
): AccountValuationCandidate {
  return {
    accountId: "account-1",
    amount,
    basis: "balance",
    currency: "EUR",
    effectiveAt: observedAt,
    recordedAt: observedAt,
    valuationCandidateId: "valuation-1",
    valuationMethod: "reported",
    ...overrides,
  };
}

function account(
  overrides: Partial<AccountWealthCalculationState> = {},
): AccountWealthCalculationState {
  return {
    accountId: "account-1",
    accountName: "Checking",
    archivedAt: null,
    balance: candidate(),
    category: "cash",
    estimatedValue: null,
    externalLifecycle: "active",
    identityConflict: false,
    inclusionPolicy: "automatic",
    institutionId: "bank-1",
    institutionName: "Bank",
    latestDataRecordedAt: observedAt,
    likelyDuplicateGroupId: null,
    managementMode: "external",
    mergedIntoAccountId: null,
    purpose: "personal",
    refreshUncertain: false,
    selectedValuationMethod: "reported",
    typeSupport: "supported",
    ...overrides,
  };
}

describe("wealth calculation policy", () => {
  test("keeps an inclusive headline and duplicate-adjusted estimate", () => {
    const snapshot = calculateWealthSnapshot([
      account({ accountId: "a", likelyDuplicateGroupId: "group" }),
      account({
        accountId: "b",
        balance: candidate("90", {
          accountId: "b",
          effectiveAt: new Date("2026-08-31T12:00:00Z"),
          valuationCandidateId: "valuation-b",
        }),
        likelyDuplicateGroupId: "group",
      }),
    ]);

    expect(snapshot).toMatchObject({
      duplicateAdjustedEstimateAmount: "90",
      headlineAmount: "190.25",
      isComplete: false,
      likelyDuplicateGroupCount: 1,
    });
    expect(snapshot.decisions.map((item) => item.duplicateRole)).toEqual([
      "excluded_from_adjusted_estimate",
      "representative",
    ]);
  });

  test("distinguishes unknown, known unsupported, and missing currency", () => {
    const snapshot = calculateWealthSnapshot([
      account({ accountId: "unknown", category: "unknown", typeSupport: "unrecognized" }),
      account({ accountId: "loan", category: "unknown", typeSupport: "known_unsupported" }),
      account({
        accountId: "missing-currency",
        balance: candidate("42", { accountId: "missing-currency", currency: null }),
      }),
    ]);

    expect(snapshot.decisions.map((item) => item.decision)).toEqual([
      "unknown_account_category",
      "known_unsupported_account",
      "missing_currency",
    ]);
    expect(snapshot.headlineAmount).toBe("0");
  });

  test("uses the category-selected candidate with no silent fallback", () => {
    const snapshot = calculateWealthSnapshot([
      account({
        balance: null,
        estimatedValue: candidate("500", { basis: "estimated_value" }),
      }),
    ]);
    expect(snapshot.decisions[0]?.decision).toBe("missing_selected_valuation");
    expect(snapshot.headlineAmount).toBe("0");
  });

  test("returns the expected decision for each represented eligibility branch", () => {
    const decisions = calculateWealthSnapshot([
      account({ accountId: "merged", mergedIntoAccountId: "canonical" }),
      account({ accountId: "archived", archivedAt: observedAt }),
      account({ accountId: "disabled", externalLifecycle: "disabled" }),
      account({ accountId: "policy", inclusionPolicy: "exclude" }),
      account({ accountId: "business", purpose: "business" }),
      account({ accountId: "unsupported", typeSupport: "known_unsupported" }),
      account({ accountId: "unknown", category: "unknown" }),
      account({ accountId: "missing", balance: null }),
      account({
        accountId: "currency-missing",
        balance: candidate("10", { currency: null }),
      }),
      account({
        accountId: "currency-unsupported",
        balance: candidate("10", { currency: "USD" }),
      }),
      account({ accountId: "included" }),
    ]).decisions.map((decision) => decision.decision);

    expect(decisions).toEqual([
      "excluded_merged",
      "excluded_archived",
      "excluded_external_lifecycle",
      "excluded_by_policy",
      "excluded_business",
      "known_unsupported_account",
      "unknown_account_category",
      "missing_selected_valuation",
      "missing_currency",
      "unsupported_currency",
      "included",
    ]);
  });
});
