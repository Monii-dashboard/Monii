import {
  calculateWealthSnapshot,
  classifyAccountIdentity,
  createCurrentWealth,
  synchronizeFinancialSource,
  type AccountWealthState,
  type FinancialSource,
  type IdentityAccount,
  type SynchronizationRepository,
} from "../../packages/application/src/index";
import { describe, expect, test, vi } from "vitest";

const observedAt = new Date("2026-08-30T12:00:00Z");

function account(overrides: Partial<AccountWealthState> = {}): AccountWealthState {
  return {
    accountId: "account-1",
    balance: {
      amount: "100.25",
      currency: "EUR",
      observationId: "observation-1",
      retrievedAt: observedAt,
      sourceValidAt: observedAt,
    },
    estimatedValue: null,
    identityConflict: false,
    inclusion: "automatic",
    kind: "cash",
    latestObservationId: "observation-1",
    lifecycle: "active",
    likelyDuplicateGroupId: null,
    refreshUncertain: false,
    usage: "private",
    ...overrides,
  };
}

function identity(overrides: Partial<IdentityAccount> = {}): IdentityAccount {
  return {
    accountId: "account-1",
    currency: "EUR",
    evidence: {
      accountNumberFingerprint: "number-1",
      ibanFingerprint: "iban-1",
      keyVersion: "v1",
      sourceNameFingerprint: "name-1",
    },
    institutionId: "bank-1",
    kind: "cash",
    referenceId: "reference-1",
    ...overrides,
  };
}

describe("account identity policy", () => {
  test("confirms the composite identity but separates shared-IBAN currency pockets", () => {
    expect(
      classifyAccountIdentity(
        identity(),
        identity({ accountId: "account-2", referenceId: "reference-2" }),
      ),
    ).toBe("confirmed_duplicate");
    expect(
      classifyAccountIdentity(
        identity(),
        identity({
          accountId: "usd",
          currency: "USD",
          referenceId: "reference-usd",
        }),
      ),
    ).toBe("distinct");
    expect(
      classifyAccountIdentity(
        identity(),
        identity({
          accountId: "other-number",
          evidence: {
            ...identity().evidence,
            accountNumberFingerprint: "number-2",
          },
          referenceId: "reference-3",
        }),
      ),
    ).toBe("distinct");
  });

  test("creates a likely candidate only when strong evidence is unavailable", () => {
    expect(
      classifyAccountIdentity(
        identity({ evidence: { ...identity().evidence, ibanFingerprint: null } }),
        identity({
          accountId: "account-2",
          evidence: {
            ...identity().evidence,
            accountNumberFingerprint: null,
            ibanFingerprint: null,
          },
          referenceId: "reference-2",
        }),
      ),
    ).toBe("likely_duplicate");
  });
});

describe("wealth policy", () => {
  test("keeps an inclusive total and a candidate-adjusted estimate", () => {
    const snapshot = calculateWealthSnapshot([
      account({ accountId: "a", likelyDuplicateGroupId: "group" }),
      account({
        accountId: "b",
        balance: {
          amount: "90",
          currency: "EUR",
          observationId: "observation-b",
          retrievedAt: new Date("2026-08-31T12:00:00Z"),
          sourceValidAt: new Date("2026-08-31T12:00:00Z"),
        },
        likelyDuplicateGroupId: "group",
      }),
    ]);

    expect(snapshot).toMatchObject({
      candidateAdjustedTotalAmount: "90",
      isComplete: false,
      knownTotalAmount: "190.25",
      likelyDuplicateGroupCount: 1,
    });
    expect(snapshot.contributions.map((item) => item.duplicateRole)).toEqual([
      "excluded_from_adjusted",
      "representative",
    ]);
  });

  test("uses exact signed values and preserves non-EUR native data", () => {
    const snapshot = calculateWealthSnapshot([
      account(),
      account({
        accountId: "negative",
        balance: {
          amount: "-0.15000001",
          currency: "EUR",
          observationId: "negative-observation",
          retrievedAt: observedAt,
          sourceValidAt: null,
        },
      }),
      account({
        accountId: "usd",
        balance: {
          amount: "42.5",
          currency: "USD",
          observationId: "usd-observation",
          retrievedAt: observedAt,
          sourceValidAt: observedAt,
        },
      }),
    ]);

    expect(snapshot.knownTotalAmount).toBe("100.09999999");
    expect(snapshot.isComplete).toBe(false);
    expect(snapshot.contributions[2]).toMatchObject({
      decision: "unsupported_currency",
      reportedAmount: "42.5",
      reportedCurrency: "USD",
    });
  });

  test("marks account uncertainty and identity conflicts incomplete", () => {
    expect(
      calculateWealthSnapshot([account({ refreshUncertain: true })]).isComplete,
    ).toBe(false);
    expect(
      calculateWealthSnapshot([account({ identityConflict: true })]).isComplete,
    ).toBe(false);
  });
});

describe("current wealth health", () => {
  test("keeps failure separate from stale value freshness", () => {
    const baseAccount = {
      accountId: "account-1",
      adjustedAmount: "10",
      amount: "10",
      basis: "balance" as const,
      decision: "contributing" as const,
      duplicateRole: "none" as const,
      hasNewerFailedSync: false,
      identityConflict: false,
      institutionId: "institution-1",
      institutionName: "Bank",
      kind: "cash" as const,
      name: "Cash",
      reportedAmount: "10",
      reportedCurrency: "EUR",
      sourceValidAt: observedAt,
      valueRetrievedAt: observedAt,
    };
    const state = {
      lastSuccessfulSyncAt: observedAt,
      latestSyncStatus: "succeeded" as const,
      snapshot: {
        accounts: [baseAccount],
        candidateAdjustedTotalAmount: "10",
        isComplete: true,
        knownTotalAmount: "10",
        likelyDuplicateGroupCount: 0,
        recordedAt: observedAt,
        snapshotId: "snapshot-1",
      },
    };

    expect(createCurrentWealth(state, new Date("2026-09-01T12:00:00Z")).health).toBe("fresh");
    expect(createCurrentWealth(state, new Date("2026-09-01T12:00:00.001Z")).health).toBe("stale");
    expect(
      createCurrentWealth(
        {
          ...state,
          snapshot: {
            ...state.snapshot,
            accounts: [{ ...baseAccount, hasNewerFailedSync: true }],
          },
        },
        new Date("2026-08-30T13:00:00Z"),
      ).health,
    ).toBe("sync_failed");
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
    institution: { externalId: `institution-${externalId}`, name: "Bank" },
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
    const source: FinancialSource = {
      getExternalSubjectId: async () => "subject-1",
      listAccounts: async (externalId) => {
        if (externalId === "2") throw { code: "temporary", kind: "api" };
        return { accounts: [], failures: [], isComplete: true, reportedTotal: 0 };
      },
      listConnections: async () => [connection("1"), connection("2")],
    };

    await expect(
      synchronizeFinancialSource({
        actionId: "action",
        repository: persistence,
        source,
        sourceKey: "source",
        sourceKind: "test",
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
    const source: FinancialSource = {
      getExternalSubjectId: vi.fn(async () => "unused"),
      listAccounts: vi.fn(),
      listConnections: vi.fn(),
    };

    const result = await synchronizeFinancialSource({
      actionId: "action",
      repository: persistence,
      source,
      sourceKey: "source",
      sourceKind: "test",
      sourceName: "Test",
    });

    expect(result.status).toBe("skipped_already_running");
    expect(source.getExternalSubjectId).not.toHaveBeenCalled();
  });
});
