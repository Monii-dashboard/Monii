import { describe, expect, it } from "vitest";

import type { WealthCalculationRepository } from "../src/index";

type Harness = Readonly<{
  arrangeIncludedAccount(amount: string): Promise<string>;
  inspectSnapshotDecisions(): Promise<readonly string[]>;
  loadCurrentSnapshot(): Promise<Readonly<{
    headlineAmount: string;
    isComplete: boolean;
  }> | null>;
  repository: WealthCalculationRepository;
}>;

type HarnessFactory = () => Promise<Harness>;

export function wealthCalculationRepositoryContract(
  createHarness: HarnessFactory,
): void {
  describe("WealthCalculationRepository contract", () => {
    it("creates a new snapshot when an existing account policy changes", async () => {
      const harness = await createHarness();
      const accountId = await harness.arrangeIncludedAccount("42");

      await expect(
        harness.repository.changeAccountInclusionPolicy({
          accountId,
          actionId: "exclude-account",
          inclusionPolicy: "exclude",
        }),
      ).resolves.toBe(true);
      await expect(harness.loadCurrentSnapshot()).resolves.toMatchObject({
        headlineAmount: "0.00000000",
        isComplete: true,
      });
      await expect(harness.inspectSnapshotDecisions()).resolves.toEqual([
        "included",
        "excluded_by_policy",
      ]);
    });

    it("rejects a missing account without creating a snapshot", async () => {
      const harness = await createHarness();

      await expect(
        harness.repository.changeAccountInclusionPolicy({
          accountId: "00000000-0000-0000-0000-000000000000",
          actionId: "missing-account",
          inclusionPolicy: "exclude",
        }),
      ).resolves.toBe(false);
      await expect(harness.loadCurrentSnapshot()).resolves.toBeNull();
      await expect(harness.inspectSnapshotDecisions()).resolves.toEqual([]);
    });
  });
}
