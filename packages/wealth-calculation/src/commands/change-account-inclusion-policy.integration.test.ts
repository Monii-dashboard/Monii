import { synchronizeFinancialSource } from "@monii/financial-refresh";
import type { ExternalFinancialSource } from "@monii/ingestion";
import { getCurrentWealth } from "@monii/wealth-query";
import { fakeExternalAccount, fakeExternalConnection } from "@testkit/packages/ingestion";
import { expect, it } from "@testkit/integration";
import { getIntegrationDatabase } from "@testkit/postgres";
import { sql } from "drizzle-orm";

import { changeAccountInclusionPolicy } from "./change-account-inclusion-policy";

async function arrangeIncludedAccount(amount: string): Promise<string> {
  const source: ExternalFinancialSource = {
    getExternalSubjectId: async () => "subject-1",
    listAccounts: async () => ({
      accounts: [fakeExternalAccount({ balance: amount })],
      failures: [],
      isComplete: true,
      reportedTotal: 1,
    }),
    listConnections: async () => [fakeExternalConnection()],
  };
  await synchronizeFinancialSource({
    actionId: "included-account",
    adapterKey: "test",
    source,
    sourceKey: "wealth-policy",
    sourceName: "Wealth policy",
  });
  const accountId = (await getCurrentWealth()).institutions[0]?.accounts[0]
    ?.accountId;
  if (!accountId) throw new Error("Account was not persisted");
  return accountId;
}

it("creates a new snapshot when an existing account policy changes", async () => {
  const db = getIntegrationDatabase();
  const accountId = await arrangeIncludedAccount("42");

  await expect(
    changeAccountInclusionPolicy({
      accountId,
      actionId: "exclude-account",
      inclusionPolicy: "exclude",
    }),
  ).resolves.toBe(true);
  await expect(getCurrentWealth()).resolves.toMatchObject({
    headlineAmount: "0.00000000",
    isComplete: true,
  });
  const decisions = await db.execute<{ decision: string }>(sql`
    select d.decision
    from wealth.snapshot_account_decisions d
    join wealth.snapshots s on s.id = d.snapshot_id
    order by s.recorded_at, s.id
  `);
  expect(decisions.map(({ decision }) => decision)).toEqual([
    "included",
    "excluded_by_policy",
  ]);
});

it("rejects a missing account without creating a snapshot", async () => {
  const db = getIntegrationDatabase();

  await expect(
    changeAccountInclusionPolicy({
      accountId: "00000000-0000-0000-0000-000000000000",
      actionId: "missing-account",
      inclusionPolicy: "exclude",
    }),
  ).resolves.toBe(false);
  await expect(getCurrentWealth()).resolves.toMatchObject({
    headlineAmount: "0",
    isComplete: false,
  });
  const [snapshotCount] = await db.execute<{ count: number }>(sql`
    select count(*)::int count from wealth.snapshots
  `);
  expect(snapshotCount?.count).toBe(0);
});
