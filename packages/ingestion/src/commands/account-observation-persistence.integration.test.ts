import { getCurrentWealth } from "@monii/wealth-query";
import { synchronizeFinancialSource } from "@monii/financial-refresh";
import { expect, it } from "@testkit/integration";
import { getIntegrationDatabase } from "@testkit/postgres";
import { sql } from "drizzle-orm";

import { account, observedAt, source } from "./account-observation.fixtures";

async function synchronize(
  financialSource: Parameters<typeof synchronizeFinancialSource>[0]["source"],
  actionId: string,
) {
  return synchronizeFinancialSource({
    actionId,
    adapterKey: "test",
    source: financialSource,
    sourceKey: "identity-persistence",
    sourceName: "Identity persistence",
  });
}

async function currentIdentityWealth() {
  const wealth = await getCurrentWealth(observedAt);
  return {
    accounts: wealth.institutions.flatMap(({ accounts }) => accounts),
    headlineAmount: wealth.headlineAmount,
    institutionCount: wealth.institutions.length,
    isComplete: wealth.isComplete,
    likelyDuplicateGroupCount: wealth.likelyDuplicateGroupCount,
  };
}

it("preserves canonical labels and unknown values across observations", async () => {
  const db = getIntegrationDatabase();
  const unknown = (amount: string, reportedName: string) =>
    account("mystery", amount, {
      category: "unknown",
      currency: null,
      rawCurrency: "??",
      reportedName,
      reportedType: "future_product",
      typeSupport: "unrecognized",
    });

  await synchronize(
    source({ connection: [unknown("42", "Original label")] }),
    "first-observation",
  );
  await synchronize(
    source({ connection: [unknown("52", "Changed provider label")] }),
    "second-observation",
  );

  expect(await currentIdentityWealth()).toMatchObject({
    headlineAmount: "0.00000000",
    isComplete: false,
  });
  const [stored] = await db.execute<{
    canonical_name: string;
    currency: string | null;
    raw_currency: string;
    reported_name: string;
  }>(sql`
    select
      a.name canonical_name,
      v.currency,
      o.reported_currency raw_currency,
      ea.reported_name
    from ingestion.external_accounts ea
    join financial.accounts a on a.id = ea.account_id
    join ingestion.external_account_observations o
      on o.external_account_id = ea.id
    join ingestion.reported_account_valuations rv
      on rv.external_account_observation_id = o.id
    join financial.account_valuation_candidates v
      on v.id = rv.valuation_candidate_id
    order by o.observed_at desc, o.id desc
    limit 1
  `);
  expect(stored).toEqual({
    canonical_name: "Original label",
    currency: null,
    raw_currency: "??",
    reported_name: "Changed provider label",
  });
});

it("reuses one institution identity across its source connections", async () => {
  await synchronize(
    source({
      "connection-a": [account("cash-a", "10")],
      "connection-b": [account("cash-b", "20")],
    }),
    "shared-institution",
  );

  const current = await currentIdentityWealth();
  expect(current.institutionCount).toBe(1);
  expect(new Set(current.accounts.map(({ institutionId }) => institutionId)).size)
    .toBe(1);
  expect(current.headlineAmount).toBe("30.00000000");
});
