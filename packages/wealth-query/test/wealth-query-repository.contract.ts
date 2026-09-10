import { describe, expect, it } from "vitest";

import type { WealthQueryRepository } from "../src/index";

type Harness = Readonly<{
  arrangeAccountFailure(): Promise<void>;
  arrangeConnectionFailure(): Promise<void>;
  arrangeSuccessfulAccount(amount: string): Promise<void>;
  finalizeEmptyRun(runId: string): Promise<void>;
  inspectObservationHistory(): Promise<Readonly<{
    accountResultStatuses: readonly string[];
    observationCount: number;
    snapshotHeadlineAmounts: readonly string[];
  }>>;
  repository: WealthQueryRepository;
  startEmptyRun(): Promise<string>;
}>;

type HarnessFactory = () => Promise<Harness>;

export function wealthQueryRepositoryContract(
  createHarness: HarnessFactory,
): void {
  describe("WealthQueryRepository contract", () => {
    it("returns an empty state before financial knowledge is persisted", async () => {
      const { repository } = await createHarness();

      await expect(repository.loadCurrentWealthState()).resolves.toEqual({
        lastSuccessfulSynchronizationAt: null,
        latestSynchronizationStatus: null,
        snapshot: null,
      });
    });

    it("publishes a snapshot only when its synchronization is finalized", async () => {
      const harness = await createHarness();
      const runId = await harness.startEmptyRun();

      await expect(harness.repository.loadCurrentWealthState()).resolves.toEqual({
        lastSuccessfulSynchronizationAt: null,
        latestSynchronizationStatus: "running",
        snapshot: null,
      });

      await harness.finalizeEmptyRun(runId);
      const finalized = await harness.repository.loadCurrentWealthState();
      expect(finalized.latestSynchronizationStatus).toBe("succeeded");
      expect(finalized.lastSuccessfulSynchronizationAt).toBeInstanceOf(Date);
      expect(finalized.snapshot).toMatchObject({
        accounts: [],
        headlineAmount: "0.00000000",
        isComplete: true,
      });
    });

    it("returns the newest observation while retaining earlier snapshots", async () => {
      const harness = await createHarness();
      await harness.arrangeSuccessfulAccount("42");
      await harness.arrangeSuccessfulAccount("52");

      const current = await harness.repository.loadCurrentWealthState();
      expect(current.snapshot).toMatchObject({
        headlineAmount: "52.00000000",
        isComplete: true,
      });
      expect(current.snapshot?.accounts).toHaveLength(1);
      expect(await harness.inspectObservationHistory()).toEqual({
        accountResultStatuses: ["succeeded", "succeeded"],
        observationCount: 2,
        snapshotHeadlineAmounts: ["42.00000000", "52.00000000"],
      });
    });

    it("keeps the last usable observation after an account refresh fails", async () => {
      const harness = await createHarness();
      await harness.arrangeSuccessfulAccount("42");
      await harness.arrangeAccountFailure();

      const current = await harness.repository.loadCurrentWealthState();
      expect(current.latestSynchronizationStatus).toBe("partial");
      expect(current.snapshot).toMatchObject({
        headlineAmount: "42.00000000",
        isComplete: false,
      });
      expect(current.snapshot?.accounts[0]).toMatchObject({
        contributedAmount: "42.00000000",
        refreshUncertain: true,
      });
      expect((await harness.inspectObservationHistory()).accountResultStatuses)
        .toEqual(["succeeded", "provider_error"]);
    });

    it("keeps account state when an entire connection refresh fails", async () => {
      const harness = await createHarness();
      await harness.arrangeSuccessfulAccount("42.50");
      await harness.arrangeConnectionFailure();

      const current = await harness.repository.loadCurrentWealthState();
      expect(current.latestSynchronizationStatus).toBe("failed");
      expect(current.snapshot).toMatchObject({
        headlineAmount: "42.50000000",
        isComplete: false,
      });
      expect(current.snapshot?.accounts[0]).toMatchObject({
        contributedAmount: "42.50000000",
        refreshUncertain: false,
      });
      expect((await harness.inspectObservationHistory()).observationCount).toBe(1);
    });
  });
}
