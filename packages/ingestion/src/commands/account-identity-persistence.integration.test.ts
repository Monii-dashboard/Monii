import { getCurrentWealth } from "@monii/wealth-query";
import { expect, it } from "@testkit/integration";
import { getIntegrationDatabase } from "@testkit/postgres";
import { sql } from "drizzle-orm";

import type { FinancialOperationalReport } from "../reporting";
import { account, observedAt, source } from "./account-identity.fixtures";
import { synchronizeSourceInstance } from "./synchronize-source-instance";

async function synchronize(
  financialSource: Parameters<typeof synchronizeSourceInstance>[0]["source"],
  actionId: string,
  reports: FinancialOperationalReport[] = [],
) {
  return synchronizeSourceInstance({
    actionId,
    adapterKey: "test",
    reporter: { report: (record) => reports.push(record) },
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

it("merges strong account identities without rewriting snapshot history", async () => {
  const db = getIntegrationDatabase();
  const reports: FinancialOperationalReport[] = [];
  const weakIdentity = {
    accountNumberFingerprint: null,
    ibanFingerprint: null,
    keyVersion: "v1",
    reportedNameFingerprint: "name-checking",
  } as const;

  await synchronize(
    source({
      "connection-1": [
        account("provider-account-1", "506.62", { identity: weakIdentity }),
      ],
      "connection-2": [
        account("provider-account-24", "506.62", { identity: weakIdentity }),
      ],
    }),
    "weak-evidence",
    reports,
  );
  expect((await currentIdentityWealth()).headlineAmount).toBe("1013.24000000");

  const strongIdentity = { ...weakIdentity, ibanFingerprint: "iban-shared" };
  await synchronize(
    source({
      "connection-1": [
        account("provider-account-1", "506.62", { identity: strongIdentity }),
      ],
      "connection-2": [
        account("provider-account-24", "507", {
          identity: strongIdentity,
          sourceValidAt: new Date("2026-08-31T11:00:00Z"),
        }),
      ],
    }),
    "strong-evidence",
    reports,
  );

  expect(await currentIdentityWealth()).toMatchObject({
    headlineAmount: "507.00000000",
    isComplete: true,
    likelyDuplicateGroupCount: 0,
  });
  const [counts] = await db.execute<{
    account_count: number;
    alias_count: number;
    external_account_count: number;
  }>(sql`
    select
      (select count(*)::int from financial.accounts) account_count,
      (select count(*)::int from financial.account_merges) alias_count,
      (select count(*)::int from ingestion.external_accounts) external_account_count
  `);
  const snapshots = await db.execute<{ headline_amount: string }>(sql`
    select headline_amount
    from wealth.snapshots
    order by recorded_at, id
  `);
  expect({
    accountCount: counts?.account_count,
    aliasCount: counts?.alias_count,
    externalAccountCount: counts?.external_account_count,
    snapshotHeadlineAmounts: snapshots.map((row) => row.headline_amount),
  }).toEqual({
    accountCount: 2,
    aliasCount: 1,
    externalAccountCount: 2,
    snapshotHeadlineAmounts: ["1013.24000000", "507.00000000"],
  });
  expect(reports).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ event: "accounts.merge.completed" }),
      expect.objectContaining({ event: "wealth.snapshot.created" }),
    ]),
  );
});

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
