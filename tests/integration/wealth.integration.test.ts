import {
  synchronizeSourceInstance,
  type ExternalFinancialSource,
  type FinancialOperationalReport,
  type NormalizedExternalAccount,
} from "@monii/ingestion";
import { createPostgresSynchronizationRepository } from "@monii/postgres/ingestion";
import {
  createPostgresWealthCalculationRepository,
  createPostgresWealthQueryRepository,
} from "@monii/postgres/wealth";
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
      ibanFingerprint: "iban-shared",
      keyVersion: "v1",
      reportedNameFingerprint: "name-checking",
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

function connection(externalId: string, institutionId = "bank-uuid") {
  return {
    active: true,
    externalId,
    institution: { externalId: institutionId, reportedName: "Example Bank" },
    nextTryAt: null,
    sourceErrorCode: null,
    sourceState: null,
    sourceUpdatedAt: observedAt,
  };
}

function source(
  accountsByConnection: Readonly<Record<string, readonly NormalizedExternalAccount[]>>,
): ExternalFinancialSource {
  return {
    getExternalSubjectId: async () => "subject-1",
    listAccounts: async (connectionId) => ({
      accounts: accountsByConnection[connectionId] ?? [],
      failures: [],
      isComplete: true,
      reportedTotal: accountsByConnection[connectionId]?.length ?? 0,
    }),
    listConnections: async () =>
      Object.keys(accountsByConnection).map((id) => connection(id)),
  };
}

async function sync(
  repository: ReturnType<typeof createPostgresSynchronizationRepository>,
  financialSource: ExternalFinancialSource,
  actionId: string,
) {
  return synchronizeSourceInstance({
    actionId,
    adapterKey: "test",
    repository,
    source: financialSource,
    sourceKey: "test-default",
    sourceName: "Test source",
  });
}

test("merges with a stable alias and never rewrites historical provenance", async ({ db }) => {
  const reports: FinancialOperationalReport[] = [];
  const repository = createPostgresSynchronizationRepository(db, {
    report: (record) => reports.push(record),
  });
  const queryRepository = createPostgresWealthQueryRepository(db);
  await sync(
    repository,
    source({
      "connection-1": [
        account("provider-account-1", "506.62", {
          identity: {
            accountNumberFingerprint: null,
            ibanFingerprint: null,
            keyVersion: "v1",
            reportedNameFingerprint: "name-checking",
          },
        }),
      ],
      "connection-2": [
        account("provider-account-24", "506.62", {
          identity: {
            accountNumberFingerprint: null,
            ibanFingerprint: null,
            keyVersion: "v1",
            reportedNameFingerprint: "name-checking",
          },
        }),
      ],
    }),
    "first",
  );
  expect((await getCurrentWealth(queryRepository, observedAt)).headlineAmount).toBe(
    "1013.24000000",
  );

  await sync(
    repository,
    source({
      "connection-1": [account("provider-account-1", "506.62")],
      "connection-2": [
        account("provider-account-24", "507", {
          sourceValidAt: new Date("2026-08-31T11:00:00Z"),
        }),
      ],
    }),
    "repair",
  );

  expect(
    await getCurrentWealth(queryRepository, new Date("2026-08-31T12:00:00Z")),
  ).toMatchObject({
    headlineAmount: "507.00000000",
    isComplete: true,
    likelyDuplicateGroupCount: 0,
  });
  const state = await db.execute<{
    accounts: number;
    aliases: number;
    external_accounts: number;
    snapshots: number;
  }>(sql`
    select
      (select count(*)::int from financial.accounts) accounts,
      (select count(*)::int from financial.account_merges) aliases,
      (select count(*)::int from ingestion.external_accounts) external_accounts,
      (select count(*)::int from wealth.snapshots) snapshots
  `);
  expect(state[0]).toEqual({
    accounts: 2,
    aliases: 1,
    external_accounts: 2,
    snapshots: 2,
  });
  const historical = await db.execute<{ headline_amount: string }>(sql`
    select headline_amount
    from wealth.snapshots
    order by recorded_at asc
    limit 1
  `);
  expect(historical[0]?.headline_amount).toBe("1013.24000000");
  expect(reports).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        event: "ingestion.identity_match.changed",
        fields: expect.objectContaining({
          classification: "likely_duplicate",
          reason_codes: ["matching_reported_name"],
        }),
        level: "warn",
      }),
      expect.objectContaining({
        event: "wealth.duplicate_group.adjusted",
        fields: expect.objectContaining({
          representative_amount: "506.62000000",
        }),
        level: "warn",
      }),
      expect.objectContaining({
        event: "accounts.merge.completed",
        fields: expect.objectContaining({ merged_account_count: 1 }),
        level: "info",
      }),
      expect.objectContaining({
        event: "wealth.snapshot.created",
        fields: expect.objectContaining({ headline_amount: "507" }),
      }),
    ]),
  );
  expect(reports.every((record) => record.event && record.message)).toBe(true);
});

test("preserves raw unknown data and canonical labels without inventing zero", async ({ db }) => {
  const repository = createPostgresSynchronizationRepository(db);
  const queryRepository = createPostgresWealthQueryRepository(db);
  await sync(
    repository,
    source({
      connection: [
        account("mystery", "42", {
          category: "unknown",
          currency: null,
          rawCurrency: "??",
          reportedName: "Original label",
          reportedType: "future_product",
          typeSupport: "unrecognized",
        }),
      ],
    }),
    "unknown",
  );
  await sync(
    repository,
    source({
      connection: [
        account("mystery", "52", {
          category: "unknown",
          currency: null,
          rawCurrency: "??",
          reportedName: "Changed provider label",
          reportedType: "future_product",
          typeSupport: "unrecognized",
        }),
      ],
    }),
    "unknown-again",
  );

  const wealth = await getCurrentWealth(queryRepository, observedAt);
  expect(wealth).toMatchObject({ headlineAmount: "0.00000000", isComplete: false });
  expect(wealth.institutions[0]?.accounts[0]).toMatchObject({
    decision: "unknown_account_category",
    evaluatedAmount: null,
    name: "Original label",
  });
  const stored = await db.execute<{
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
    join ingestion.external_account_observations o on o.external_account_id = ea.id
    join ingestion.reported_account_valuations rv on rv.external_account_observation_id = o.id
    join financial.account_valuation_candidates v on v.id = rv.valuation_candidate_id
    order by o.observed_at desc
    limit 1
  `);
  expect(stored[0]).toEqual({
    canonical_name: "Original label",
    currency: null,
    raw_currency: "??",
    reported_name: "Changed provider label",
  });
});

test("keeps the last valuation when one account refresh fails", async ({ db }) => {
  const repository = createPostgresSynchronizationRepository(db);
  const queryRepository = createPostgresWealthQueryRepository(db);
  await sync(repository, source({ connection: [account("cash", "42")] }), "success");
  const failedSource: ExternalFinancialSource = {
    getExternalSubjectId: async () => "subject-1",
    listAccounts: async () => ({
      accounts: [],
      failures: [{
        externalId: "cash",
        failure: { code: "temporary_account_error", kind: "provider_account" },
      }],
      isComplete: true,
      reportedTotal: 1,
    }),
    listConnections: async () => [connection("connection")],
  };

  expect((await sync(repository, failedSource, "partial")).status).toBe("partial");
  expect(await getCurrentWealth(queryRepository, observedAt)).toMatchObject({
    health: "synchronization_failed",
    headlineAmount: "42.00000000",
    isComplete: false,
    latestSynchronizationStatus: "partial",
  });
  const results = await db.execute<{ status: string }>(sql`
    select status from ingestion.synchronization_account_results order by finished_at
  `);
  expect(results.map((row) => row.status)).toEqual(["succeeded", "provider_error"]);
});

test("retains the initial snapshot when account policy creates a new snapshot", async ({ db }) => {
  const synchronizationRepository = createPostgresSynchronizationRepository(db);
  const calculationRepository = createPostgresWealthCalculationRepository(db);
  const queryRepository = createPostgresWealthQueryRepository(db);
  await sync(
    synchronizationRepository,
    source({ connection: [account("cash", "42")] }),
    "initial",
  );
  const accountRows = await db.execute<{ id: string }>(sql`
    select id from financial.accounts limit 1
  `);
  const accountId = accountRows[0]?.id;
  expect(accountId).toBeDefined();

  await expect(
    calculationRepository.changeAccountInclusionPolicy({
      accountId: accountId!,
      actionId: "operator-policy-change",
      inclusionPolicy: "exclude",
    }),
  ).resolves.toBe(true);
  expect(await getCurrentWealth(queryRepository, observedAt)).toMatchObject({
    headlineAmount: "0.00000000",
    isComplete: true,
  });
  const decisions = await db.execute<{ decision: string }>(sql`
    select d.decision
    from wealth.snapshot_account_decisions d
    join wealth.snapshots s on s.id = d.snapshot_id
    order by s.recorded_at, s.id
  `);
  expect(decisions.map((row) => row.decision)).toEqual([
    "included",
    "excluded_by_policy",
  ]);
});

test("persists disabled and deleted lifecycles and excludes their valuations", async ({ db }) => {
  const repository = createPostgresSynchronizationRepository(db);
  const queryRepository = createPostgresWealthQueryRepository(db);
  const lifecycleAccount = (
    externalId: string,
    amount: string,
    lifecycle: NormalizedExternalAccount["lifecycle"],
  ) => account(externalId, amount, {
    identity: {
      accountNumberFingerprint: null,
      ibanFingerprint: `iban-${externalId}`,
      keyVersion: "v1",
      reportedNameFingerprint: `name-${externalId}`,
    },
    lifecycle,
  });

  await sync(
    repository,
    source({
      connection: [
        lifecycleAccount("disabled-account", "40.25", "active"),
        lifecycleAccount("deleted-account", "60.75", "active"),
      ],
    }),
    "initial-lifecycles",
  );
  expect((await getCurrentWealth(queryRepository, observedAt)).headlineAmount).toBe(
    "101.00000000",
  );

  await sync(
    repository,
    source({
      connection: [
        lifecycleAccount("disabled-account", "41.25", "disabled"),
        lifecycleAccount("deleted-account", "61.75", "deleted"),
      ],
    }),
    "terminal-lifecycles",
  );

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
  const latestDecisions = await db.execute<{
    decision: string;
  }>(sql`
    select d.decision
    from wealth.snapshot_account_decisions d
    where d.snapshot_id = (
      select id from wealth.snapshots order by recorded_at desc, id desc limit 1
    )
    order by d.account_name
  `);
  expect(latestDecisions.map(({ decision }) => decision)).toEqual([
    "excluded_external_lifecycle",
    "excluded_external_lifecycle",
  ]);
});

test("preserves an absent account and only records not-seen after a complete listing", async ({ db }) => {
  const repository = createPostgresSynchronizationRepository(db);
  const queryRepository = createPostgresWealthQueryRepository(db);
  await sync(repository, source({ connection: [account("cash", "42.50")] }), "initial");

  const listingSource = (isComplete: boolean): ExternalFinancialSource => ({
    getExternalSubjectId: async () => "subject-1",
    listAccounts: async () => ({
      accounts: [],
      failures: [],
      isComplete,
      reportedTotal: 1,
    }),
    listConnections: async () => [connection("connection")],
  });
  expect((await sync(repository, listingSource(false), "truncated")).status).toBe(
    "partial",
  );
  expect(await getCurrentWealth(queryRepository, observedAt)).toMatchObject({
    headlineAmount: "42.50000000",
    isComplete: false,
    latestSynchronizationStatus: "partial",
  });
  const afterTruncated = await db.execute<{ status: string }>(sql`
    select status from ingestion.synchronization_account_results order by finished_at
  `);
  expect(afterTruncated.map(({ status }) => status)).toEqual(["succeeded"]);

  expect((await sync(repository, listingSource(true), "complete")).status).toBe(
    "partial",
  );
  expect(await getCurrentWealth(queryRepository, observedAt)).toMatchObject({
    health: "synchronization_failed",
    headlineAmount: "42.50000000",
    isComplete: false,
    latestSynchronizationStatus: "partial",
  });
  const afterComplete = await db.execute<{ status: string }>(sql`
    select status from ingestion.synchronization_account_results order by finished_at
  `);
  expect(afterComplete.map(({ status }) => status)).toEqual([
    "succeeded",
    "not_seen",
  ]);
});

test("preserves account state through a whole-connection outage", async ({ db }) => {
  const repository = createPostgresSynchronizationRepository(db);
  const queryRepository = createPostgresWealthQueryRepository(db);
  await sync(repository, source({ connection: [account("cash", "42.50")] }), "initial");
  const outageSource: ExternalFinancialSource = {
    getExternalSubjectId: async () => "subject-1",
    listAccounts: async () => {
      throw new Error("Account listing must not run for an inactive connection");
    },
    listConnections: async () => [{
      ...connection("connection"),
      active: false,
      sourceErrorCode: "provider_outage",
    }],
  };

  expect((await sync(repository, outageSource, "outage")).status).toBe("failed");
  expect(await getCurrentWealth(queryRepository, observedAt)).toMatchObject({
    health: "synchronization_failed",
    headlineAmount: "42.50000000",
    isComplete: false,
    latestSynchronizationStatus: "failed",
  });
  const durable = await db.execute<{
    account_statuses: string[];
    connection_statuses: string[];
  }>(sql`
    select
      array(select status from ingestion.synchronization_account_results order by finished_at) account_statuses,
      array(select status from ingestion.synchronization_connection_results order by finished_at) connection_statuses
  `);
  expect(durable[0]).toEqual({
    account_statuses: ["succeeded"],
    connection_statuses: ["succeeded", "failed"],
  });
});
