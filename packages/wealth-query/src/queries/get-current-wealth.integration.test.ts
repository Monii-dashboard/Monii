import { synchronizeFinancialSource } from "@monii/financial-refresh";
import {
  finalizeSynchronizationRun,
  type ExternalFinancialSource,
} from "@monii/ingestion";
import { SourceInstance, SynchronizationRun } from "@monii/ingestion/models";
import { createWealthSnapshot } from "@monii/wealth-calculation";
import {
  fakeExternalAccount,
  fakeExternalConnection,
} from "@testkit/packages/ingestion";
import { expect, it } from "@testkit/integration";
import { getIntegrationDatabase } from "@testkit/postgres";
import { sql } from "drizzle-orm";

import { getCurrentWealth } from "./get-current-wealth";

function source(
  listAccounts: ExternalFinancialSource["listAccounts"],
  listConnections: ExternalFinancialSource["listConnections"] = async () => [
    fakeExternalConnection(),
  ],
): ExternalFinancialSource {
  return {
    getExternalSubjectId: async () => "subject-1",
    listAccounts,
    listConnections,
  };
}

async function synchronize(
  financialSource: ExternalFinancialSource,
  prefix: string,
) {
  await synchronizeFinancialSource({
    actionId: prefix,
    adapterKey: "test",
    source: financialSource,
    sourceKey: "wealth-query",
    sourceName: "Wealth query",
  });
}

it("returns an incomplete empty view before financial knowledge exists", async () => {
  await expect(getCurrentWealth()).resolves.toMatchObject({
    headlineAmount: "0",
    institutions: [],
    isComplete: false,
    lastSuccessfulSynchronizationAt: null,
    latestSynchronizationStatus: null,
    recordedAt: null,
  });
});

it("does not expose a snapshot for a running synchronization", async () => {
  const sourceInstance = await SourceInstance.create({
    adapterKey: "test",
    name: "Running source",
    sourceKey: "running-source",
  });
  const run = await SynchronizationRun.create({
    actionId: "running",
    sourceInstanceId: sourceInstance.id,
  });

  await expect(getCurrentWealth()).resolves.toMatchObject({
    latestSynchronizationStatus: "running",
    recordedAt: null,
  });

  await finalizeSynchronizationRun(run.id, "succeeded");
  await createWealthSnapshot({
    actionId: "running",
    causationId: run.id,
    reason: "synchronization",
    synchronizationRunId: run.id,
  });
  await expect(getCurrentWealth()).resolves.toMatchObject({
    headlineAmount: "0.00000000",
    isComplete: true,
    latestSynchronizationStatus: "succeeded",
    recordedAt: expect.any(Date),
  });
});

it("returns the newest observation while retaining earlier history", async () => {
  const db = getIntegrationDatabase();
  const successfulSource = (amount: string) =>
    source(async () => ({
      accounts: [fakeExternalAccount({ balance: amount })],
      failures: [],
      isComplete: true,
      reportedTotal: 1,
    }));
  await synchronize(successfulSource("42"), "first-observation");
  await synchronize(successfulSource("52"), "second-observation");

  await expect(getCurrentWealth()).resolves.toMatchObject({
    headlineAmount: "52.00000000",
    isComplete: true,
  });
  const [counts] = await db.execute<{ observation_count: number }>(sql`
    select count(*)::int observation_count
    from ingestion.external_account_observations
  `);
  const snapshots = await db.execute<{ headline_amount: string }>(sql`
    select headline_amount
    from wealth.snapshots
    order by recorded_at, id
  `);
  expect(counts?.observation_count).toBe(2);
  expect(snapshots.map(({ headline_amount }) => headline_amount)).toEqual([
    "42.00000000",
    "52.00000000",
  ]);
});

it("keeps the last usable value when an account refresh fails", async () => {
  const db = getIntegrationDatabase();
  await synchronize(
    source(async () => ({
      accounts: [fakeExternalAccount({ balance: "42" })],
      failures: [],
      isComplete: true,
      reportedTotal: 1,
    })),
    "successful-account",
  );
  await synchronize(
    source(async () => ({
      accounts: [],
      failures: [
        {
          externalId: "test-account",
          failure: {
            code: "temporary_account_error",
            kind: "provider_account",
          },
        },
      ],
      isComplete: true,
      reportedTotal: 1,
    })),
    "account-failure",
  );

  await expect(getCurrentWealth()).resolves.toMatchObject({
    headlineAmount: "42.00000000",
    isComplete: false,
    latestSynchronizationStatus: "partial",
    institutions: [
      {
        accounts: [
          { contributedAmount: "42.00000000", refreshUncertain: true },
        ],
      },
    ],
  });
  const results = await db.execute<{ status: string }>(sql`
    select status
    from ingestion.synchronization_account_results
    order by finished_at, id
  `);
  expect(results.map(({ status }) => status)).toEqual([
    "succeeded",
    "provider_error",
  ]);
});

it("keeps account state when an entire connection refresh fails", async () => {
  const db = getIntegrationDatabase();
  await synchronize(
    source(async () => ({
      accounts: [fakeExternalAccount({ balance: "42.50" })],
      failures: [],
      isComplete: true,
      reportedTotal: 1,
    })),
    "successful-account",
  );
  await synchronize(
    source(
      async () => {
        throw new Error("Account listing must not run");
      },
      async () => [
        fakeExternalConnection({
          active: false,
          sourceErrorCode: "provider_outage",
        }),
      ],
    ),
    "connection-failure",
  );

  await expect(getCurrentWealth()).resolves.toMatchObject({
    headlineAmount: "42.50000000",
    isComplete: false,
    latestSynchronizationStatus: "failed",
    institutions: [
      {
        accounts: [
          { contributedAmount: "42.50000000", refreshUncertain: false },
        ],
      },
    ],
  });
  const [counts] = await db.execute<{ observation_count: number }>(sql`
    select count(*)::int observation_count
    from ingestion.external_account_observations
  `);
  expect(counts?.observation_count).toBe(1);
});
