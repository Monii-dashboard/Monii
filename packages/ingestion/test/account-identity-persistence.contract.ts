import { describe, expect, it } from "vitest";

import {
  synchronizeSourceInstance,
  type FinancialOperationalReport,
  type SynchronizationRepository,
} from "../src/index";
import {
  contractAccount,
  contractObservedAt,
  contractSource,
} from "./contract-source";

type CurrentAccount = Readonly<{
  accountId: string;
  decision: string;
  institutionId: string | null;
  name: string;
}>;

type Harness = Readonly<{
  inspectIdentityHistory(): Promise<Readonly<{
    accountCount: number;
    aliasCount: number;
    externalAccountCount: number;
    snapshotHeadlineAmounts: readonly string[];
  }>>;
  inspectLatestUnknownObservation(): Promise<Readonly<{
    canonicalName: string;
    currency: string | null;
    rawCurrency: string;
    reportedName: string;
  }>>;
  loadCurrentWealth(): Promise<Readonly<{
    accounts: readonly CurrentAccount[];
    headlineAmount: string;
    institutionCount: number;
    isComplete: boolean;
    likelyDuplicateGroupCount: number;
  }>>;
  reports: FinancialOperationalReport[];
  repository: SynchronizationRepository;
}>;

type HarnessFactory = () => Promise<Harness>;

async function synchronize(
  repository: SynchronizationRepository,
  source: Parameters<typeof synchronizeSourceInstance>[0]["source"],
  actionId: string,
) {
  return synchronizeSourceInstance({
    actionId,
    adapterKey: "contract",
    repository,
    source,
    sourceKey: "identity-contract",
    sourceName: "Identity contract",
  });
}

export function accountIdentityPersistenceContract(
  createHarness: HarnessFactory,
): void {
  describe("account and institution persistence contract", () => {
    it("merges strong account identities without rewriting snapshot history", async () => {
      const harness = await createHarness();
      const weakIdentity = {
        accountNumberFingerprint: null,
        ibanFingerprint: null,
        keyVersion: "v1",
        reportedNameFingerprint: "name-checking",
      } as const;

      await synchronize(
        harness.repository,
        contractSource({
          "connection-1": [
            contractAccount("provider-account-1", "506.62", {
              identity: weakIdentity,
            }),
          ],
          "connection-2": [
            contractAccount("provider-account-24", "506.62", {
              identity: weakIdentity,
            }),
          ],
        }),
        "weak-evidence",
      );
      expect((await harness.loadCurrentWealth()).headlineAmount).toBe(
        "1013.24000000",
      );

      const strongIdentity = {
        ...weakIdentity,
        ibanFingerprint: "iban-shared",
      };
      await synchronize(
        harness.repository,
        contractSource({
          "connection-1": [
            contractAccount("provider-account-1", "506.62", {
              identity: strongIdentity,
            }),
          ],
          "connection-2": [
            contractAccount("provider-account-24", "507", {
              identity: strongIdentity,
              sourceValidAt: new Date("2026-08-31T11:00:00Z"),
            }),
          ],
        }),
        "strong-evidence",
      );

      expect(await harness.loadCurrentWealth()).toMatchObject({
        headlineAmount: "507.00000000",
        isComplete: true,
        likelyDuplicateGroupCount: 0,
      });
      expect(await harness.inspectIdentityHistory()).toEqual({
        accountCount: 2,
        aliasCount: 1,
        externalAccountCount: 2,
        snapshotHeadlineAmounts: ["1013.24000000", "507.00000000"],
      });
      expect(harness.reports).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ event: "accounts.merge.completed" }),
          expect.objectContaining({ event: "wealth.snapshot.created" }),
        ]),
      );
    });

    it("preserves canonical labels and unknown values across observations", async () => {
      const harness = await createHarness();
      const unknown = (amount: string, reportedName: string) =>
        contractAccount("mystery", amount, {
          category: "unknown",
          currency: null,
          rawCurrency: "??",
          reportedName,
          reportedType: "future_product",
          typeSupport: "unrecognized",
        });

      await synchronize(
        harness.repository,
        contractSource({ connection: [unknown("42", "Original label")] }),
        "first-observation",
      );
      await synchronize(
        harness.repository,
        contractSource({ connection: [unknown("52", "Changed provider label")] }),
        "second-observation",
      );

      expect(await harness.loadCurrentWealth()).toMatchObject({
        headlineAmount: "0.00000000",
        isComplete: false,
      });
      expect(await harness.inspectLatestUnknownObservation()).toEqual({
        canonicalName: "Original label",
        currency: null,
        rawCurrency: "??",
        reportedName: "Changed provider label",
      });
    });

    it("reuses one institution identity across its source connections", async () => {
      const harness = await createHarness();

      await synchronize(
        harness.repository,
        contractSource({
          "connection-a": [contractAccount("cash-a", "10")],
          "connection-b": [contractAccount("cash-b", "20")],
        }),
        "shared-institution",
      );

      const current = await harness.loadCurrentWealth();
      expect(current.institutionCount).toBe(1);
      expect(new Set(current.accounts.map(({ institutionId }) => institutionId)).size)
        .toBe(1);
      expect(current.headlineAmount).toBe("30.00000000");
    });
  });
}

export { contractObservedAt };
