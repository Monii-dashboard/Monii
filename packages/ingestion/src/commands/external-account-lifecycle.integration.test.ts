import { getCurrentWealth } from "@monii/wealth-query";
import { fakeExternalAccount, fakeExternalConnection } from "@testkit/packages/ingestion";
import { expect, it } from "@testkit/integration";
import { getIntegrationDatabase } from "@testkit/postgres";
import { sql } from "drizzle-orm";

import type { ExternalFinancialSource } from "../external-financial-source";
import { synchronizeSourceInstance } from "./synchronize-source-instance";

const observedAt = new Date("2026-08-31T10:00:00Z");

it("excludes newly disabled and deleted accounts while retaining their observations", async () => {
  const db = getIntegrationDatabase();
  const synchronize = (accounts: Awaited<ReturnType<ExternalFinancialSource["listAccounts"]>>["accounts"], actionId: string) =>
    synchronizeSourceInstance({
      actionId,
      adapterKey: "test",
      source: {
        getExternalSubjectId: async () => "subject-1",
        listAccounts: async () => ({
          accounts,
          failures: [],
          isComplete: true,
          reportedTotal: accounts.length,
        }),
        listConnections: async () => [fakeExternalConnection()],
      },
      sourceKey: "external-account-lifecycle",
      sourceName: "External account lifecycle",
    });
  const account = (
    externalId: string,
    amount: string,
    lifecycle: "active" | "deleted" | "disabled",
  ) => fakeExternalAccount({
    balance: amount,
    externalId,
    lifecycle,
    sourceValidAt: observedAt,
  });

  await synchronize([
    account("disabled-account", "40.25", "active"),
    account("deleted-account", "60.75", "active"),
  ], "initial-lifecycles");
  await synchronize([
    account("disabled-account", "41.25", "disabled"),
    account("deleted-account", "61.75", "deleted"),
  ], "terminal-lifecycles");

  expect(await getCurrentWealth(observedAt)).toMatchObject({
    headlineAmount: "0.00000000",
    isComplete: true,
  });
  const durable = await db.execute<{
    external_id: string;
    lifecycle: string;
    valuation_count: number;
  }>(sql`
    select
      ea.external_id,
      ea.lifecycle,
      count(v.id)::int valuation_count
    from ingestion.external_accounts ea
    join financial.account_valuation_candidates v on v.account_id = ea.account_id
    group by ea.external_id, ea.lifecycle
    order by ea.external_id
  `);
  expect(durable).toEqual([
    {
      external_id: "deleted-account",
      lifecycle: "deleted",
      valuation_count: 2,
    },
    {
      external_id: "disabled-account",
      lifecycle: "disabled",
      valuation_count: 2,
    },
  ]);
});
