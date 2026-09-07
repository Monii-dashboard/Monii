import type { AccountValuationCandidate } from "@monii/accounts";
import {
  classifyExternalAccountIdentity,
  synchronizeSourceInstance,
  type ExternalFinancialSource,
  type IdentityAccount,
  type SynchronizationRepository,
} from "@monii/ingestion";
import {
  calculateWealthSnapshot,
  type AccountWealthCalculationState,
} from "@monii/wealth-calculation";
import { buildCurrentWealthView } from "@monii/wealth-query";
import { describe, expect, test, vi } from "vitest";

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
      classifyExternalAccountIdentity(
        identity(),
        identity({ accountId: "account-2", externalAccountId: "external-2" }),
      ),
    ).toBe("confirmed_duplicate");
    expect(
      classifyExternalAccountIdentity(
        identity(),
        identity({
          accountId: "usd",
          currency: "USD",
          externalAccountId: "external-usd",
        }),
      ),
    ).toBe("distinct");
  });

  test("uses mutable names only to suggest a likely duplicate", () => {
    expect(
      classifyExternalAccountIdentity(
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
      ),
    ).toBe("likely_duplicate");
  });
});

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
});

describe("current wealth projection", () => {
  test("uses frozen labels and distinguishes failed refresh from staleness", () => {
    const baseAccount = {
      accountId: "account-1",
      accountName: null,
      adjustedAmount: "10",
      category: "cash" as const,
      contributedAmount: "10",
      decision: "included" as const,
      duplicateRole: "none" as const,
      evaluatedAmount: "10",
      evaluatedCurrency: "EUR",
      identityConflict: false,
      institutionId: null,
      institutionName: null,
      refreshUncertain: false,
      valuationEffectiveAt: observedAt,
      valuationRecordedAt: observedAt,
    };
    const state = {
      lastSuccessfulSynchronizationAt: observedAt,
      latestSynchronizationStatus: "succeeded" as const,
      snapshot: {
        accounts: [baseAccount],
        duplicateAdjustedEstimateAmount: "10",
        headlineAmount: "10",
        isComplete: true,
        likelyDuplicateGroupCount: 0,
        recordedAt: observedAt,
        snapshotId: "snapshot-1",
      },
    };

    const fresh = buildCurrentWealthView(state, new Date("2026-09-01T12:00:00Z"));
    expect(fresh.health).toBe("fresh");
    expect(fresh.institutions[0]).toMatchObject({
      accounts: [{ name: "Unnamed account" }],
      name: "Unknown institution",
    });
    expect(
      buildCurrentWealthView(state, new Date("2026-09-01T12:00:00.001Z")).health,
    ).toBe("stale");
    expect(
      buildCurrentWealthView(
        {
          ...state,
          snapshot: {
            ...state.snapshot,
            accounts: [{ ...baseAccount, refreshUncertain: true }],
          },
        },
        new Date("2026-08-30T13:00:00Z"),
      ).health,
    ).toBe("synchronization_failed");
  });
});

function repository(): SynchronizationRepository {
  return {
    finalizeRun: vi.fn(async () => undefined),
    identifyRunSource: vi.fn(async () => undefined),
    markRunFailed: vi.fn(async () => undefined),
    recordConnectionFailure: vi.fn(async () => undefined),
    recordConnectionResult: vi.fn(async () => ({
      failedAccountCount: 0,
      status: "succeeded" as const,
      successfulAccountCount: 0,
    })),
    startRun: vi.fn(async () => ({ runId: "run-1", status: "started" as const })),
  };
}

function connection(externalId: string) {
  return {
    active: true,
    externalId,
    institution: {
      externalId: `institution-${externalId}`,
      reportedName: "Bank",
    },
    nextTryAt: null,
    sourceErrorCode: null,
    sourceState: null,
    sourceUpdatedAt: null,
  };
}

describe("synchronization orchestration", () => {
  test("isolates failed and partial connections then finalizes once", async () => {
    const persistence = repository();
    vi.mocked(persistence.recordConnectionResult).mockResolvedValueOnce({
      failedAccountCount: 1,
      status: "partial",
      successfulAccountCount: 2,
    });
    const source: ExternalFinancialSource = {
      getExternalSubjectId: async () => "subject-1",
      listAccounts: async (externalId) => {
        if (externalId === "2") throw { code: "temporary", kind: "api" };
        return { accounts: [], failures: [], isComplete: true, reportedTotal: 0 };
      },
      listConnections: async () => [connection("1"), connection("2")],
    };

    await expect(
      synchronizeSourceInstance({
        actionId: "action",
        adapterKey: "test",
        repository: persistence,
        source,
        sourceKey: "source",
        sourceName: "Test",
      }),
    ).resolves.toMatchObject({
      failedConnectionCount: 1,
      partialConnectionCount: 1,
      status: "partial",
    });
    expect(persistence.finalizeRun).toHaveBeenCalledOnce();
  });

  test("skips an overlapping run without calling the provider", async () => {
    const persistence = repository();
    vi.mocked(persistence.startRun).mockResolvedValue({
      status: "skipped_already_running",
    });
    const source: ExternalFinancialSource = {
      getExternalSubjectId: vi.fn(async () => "unused"),
      listAccounts: vi.fn(),
      listConnections: vi.fn(),
    };

    const result = await synchronizeSourceInstance({
      actionId: "action",
      adapterKey: "test",
      repository: persistence,
      source,
      sourceKey: "source",
      sourceName: "Test",
    });
    expect(result.status).toBe("skipped_already_running");
    expect(source.getExternalSubjectId).not.toHaveBeenCalled();
  });
});
