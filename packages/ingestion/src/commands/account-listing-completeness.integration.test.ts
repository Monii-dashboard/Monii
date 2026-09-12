import { getCurrentWealth } from "@monii/wealth-query";
import { synchronizeFinancialSource } from "@monii/financial-refresh";
import { fakeExternalAccount, fakeExternalConnection } from "@testkit/packages/ingestion";
import { expect, it } from "@testkit/integration";
import { getIntegrationDatabase } from "@testkit/postgres";
import { sql } from "drizzle-orm";

import type { ExternalFinancialSource } from "../external-financial-source";

const observedAt = new Date("2026-08-31T10:00:00Z");

it("records not-seen only after a complete listing while retaining the last value", async () => {
  const db = getIntegrationDatabase();
  const synchronize = (
    listAccounts: ExternalFinancialSource["listAccounts"],
    actionId: string,
  ) => synchronizeFinancialSource({
    actionId,
    adapterKey: "test",
    source: {
      getExternalSubjectId: async () => "subject-1",
      listAccounts,
      listConnections: async () => [fakeExternalConnection()],
    },
    sourceKey: "account-listing-completeness",
    sourceName: "Account listing completeness",
  });

  await synchronize(async () => ({
    accounts: [fakeExternalAccount({
      balance: "42.50",
      externalId: "cash",
      sourceValidAt: observedAt,
    })],
    failures: [],
    isComplete: true,
    reportedTotal: 1,
  }), "initial");
  const emptyListing = (isComplete: boolean) => async () => ({
    accounts: [],
    failures: [],
    isComplete,
    reportedTotal: 1,
  });

  expect((await synchronize(emptyListing(false), "truncated")).status)
    .toBe("partial");
  let results = await db.execute<{ status: string }>(sql`
    select status from ingestion.synchronization_account_results order by finished_at
  `);
  expect(results.map(({ status }) => status)).toEqual(["succeeded"]);

  expect((await synchronize(emptyListing(true), "complete")).status)
    .toBe("partial");
  expect(await getCurrentWealth(observedAt)).toMatchObject({
    headlineAmount: "42.50000000",
    isComplete: false,
    latestSynchronizationStatus: "partial",
  });
  results = await db.execute<{ status: string }>(sql`
    select status from ingestion.synchronization_account_results order by finished_at
  `);
  expect(results.map(({ status }) => status)).toEqual([
    "succeeded",
    "not_seen",
  ]);
});
