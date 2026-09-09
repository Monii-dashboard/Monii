import { describe, expect, test } from "vitest";

import { buildCurrentWealthView } from "./current-wealth";

const observedAt = new Date("2026-08-30T12:00:00Z");

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
      contributedAmount: "10",
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
    expect(
      buildCurrentWealthView(
        { ...state, latestSynchronizationStatus: "failed" },
        new Date("2026-08-30T13:00:00Z"),
      ).health,
    ).toBe("synchronization_failed");
  });

  test("sums each institution contribution without losing decimal precision", () => {
    const view = buildCurrentWealthView(
      {
        lastSuccessfulSynchronizationAt: observedAt,
        latestSynchronizationStatus: "succeeded",
        snapshot: {
          accounts: [
            {
              accountId: "one",
              accountName: "Checking",
              adjustedAmount: "0.1",
              category: "cash",
              contributedAmount: "0.1",
              decision: "included",
              duplicateRole: "none",
              evaluatedAmount: "0.1",
              evaluatedCurrency: "EUR",
              identityConflict: false,
              institutionId: "bank",
              institutionName: "Bank",
              refreshUncertain: false,
              valuationEffectiveAt: observedAt,
              valuationRecordedAt: observedAt,
            },
            {
              accountId: "two",
              accountName: "Savings",
              adjustedAmount: "0.2",
              category: "cash",
              contributedAmount: "0.2",
              decision: "included",
              duplicateRole: "none",
              evaluatedAmount: "0.2",
              evaluatedCurrency: "EUR",
              identityConflict: false,
              institutionId: "bank",
              institutionName: "Bank",
              refreshUncertain: false,
              valuationEffectiveAt: observedAt,
              valuationRecordedAt: observedAt,
            },
          ],
          duplicateAdjustedEstimateAmount: "0.3",
          headlineAmount: "0.3",
          isComplete: true,
          likelyDuplicateGroupCount: 0,
          recordedAt: observedAt,
          snapshotId: "snapshot-1",
        },
      },
      observedAt,
    );

    expect(view.institutions[0]?.contributedAmount).toBe("0.3");
  });
});
