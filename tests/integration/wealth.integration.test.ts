import {
  synchronizeSourceInstance,
  type ExternalFinancialSource,
  type NormalizedExternalAccount,
} from "@monii/ingestion";
import { createPostgresSynchronizationRepository } from "@monii/postgres/ingestion";
import { createPostgresWealthQueryRepository } from "@monii/postgres/wealth";
import { getCurrentWealth } from "@monii/wealth-query";
import { sql } from "drizzle-orm";

import { expect, test } from "../support/postgres";

const observedAt = new Date("2026-08-31T10:00:00Z");

function account(
  externalId: string,
  amount: string,
  overrides: Partial<NormalizedExternalAccount> = {},
): NormalizedExternalAccount {
  return {
    balance: amount,
    category: "cash",
    currency: "EUR",
    estimatedValue: null,
    externalId,
    identity: {
      accountNumberFingerprint: null,
      ibanFingerprint: `iban-${externalId}`,
      keyVersion: "v1",
      reportedNameFingerprint: `name-${externalId}`,
    },
    lifecycle: "active",
    purpose: "personal",
    rawCurrency: "eur",
    reportedName: "Checking",
    reportedType: "checking",
    sourceValidAt: observedAt,
    typeSupport: "supported",
    ...overrides,
  };
}

function connection() {
  return {
    active: true,
    externalId: "connection",
    institution: {
      externalId: "institution",
      reportedName: "Example Bank",
    },
    nextTryAt: null,
    sourceErrorCode: null,
    sourceState: null,
    sourceUpdatedAt: observedAt,
  };
}

function source(accounts: readonly NormalizedExternalAccount[]): ExternalFinancialSource {
  return {
    getExternalSubjectId: async () => "subject-1",
    listAccounts: async () => ({
      accounts,
      failures: [],
      isComplete: true,
      reportedTotal: accounts.length,
    }),
    listConnections: async () => [connection()],
  };
}

async function synchronize(
  repository: ReturnType<typeof createPostgresSynchronizationRepository>,
  financialSource: ExternalFinancialSource,
  actionId: string,
) {
  return synchronizeSourceInstance({
    actionId,
    adapterKey: "test",
    repository,
    source: financialSource,
    sourceKey: "cross-package-scenario",
    sourceName: "Cross-package scenario",
  });
}

test("excludes newly disabled and deleted accounts while retaining their observations", async ({ db }) => {
  const repository = createPostgresSynchronizationRepository(db);
  const queryRepository = createPostgresWealthQueryRepository(db);
  const lifecycleAccount = (
    externalId: string,
    amount: string,
    lifecycle: NormalizedExternalAccount["lifecycle"],
  ) => account(externalId, amount, { lifecycle });

  await synchronize(repository, source([
    lifecycleAccount("disabled-account", "40.25", "active"),
    lifecycleAccount("deleted-account", "60.75", "active"),
  ]), "initial-lifecycles");
  await synchronize(repository, source([
    lifecycleAccount("disabled-account", "41.25", "disabled"),
    lifecycleAccount("deleted-account", "61.75", "deleted"),
  ]), "terminal-lifecycles");

  expect(await getCurrentWealth(queryRepository, observedAt)).toMatchObject({
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

test("records not-seen only after a complete listing while retaining the last value", async ({ db }) => {
  const repository = createPostgresSynchronizationRepository(db);
  const queryRepository = createPostgresWealthQueryRepository(db);
  await synchronize(repository, source([account("cash", "42.50")]), "initial");

  const emptyListing = (isComplete: boolean): ExternalFinancialSource => ({
    getExternalSubjectId: async () => "subject-1",
    listAccounts: async () => ({
      accounts: [],
      failures: [],
      isComplete,
      reportedTotal: 1,
    }),
    listConnections: async () => [connection()],
  });
  expect((await synchronize(repository, emptyListing(false), "truncated")).status)
    .toBe("partial");
  let results = await db.execute<{ status: string }>(sql`
    select status from ingestion.synchronization_account_results order by finished_at
  `);
  expect(results.map(({ status }) => status)).toEqual(["succeeded"]);

  expect((await synchronize(repository, emptyListing(true), "complete")).status)
    .toBe("partial");
  expect(await getCurrentWealth(queryRepository, observedAt)).toMatchObject({
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
