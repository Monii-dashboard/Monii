import {
  getCurrentWealth,
  synchronizeFinancialSource,
  type FinancialSource,
  type NormalizedAccount,
} from "@monii/wealth";
import { sql } from "drizzle-orm";

import { createFinancialRepository } from "@monii/server/wealth";
import { expect, test } from "../integration-test";

const observedAt = new Date("2026-08-31T10:00:00Z");

function account(
  externalId: string,
  amount: string,
  overrides: Partial<NormalizedAccount> = {},
): NormalizedAccount {
  return {
    balance: amount,
    currency: "EUR",
    estimatedValue: null,
    externalId,
    identity: {
      accountNumberFingerprint: null,
      ibanFingerprint: "iban-shared",
      keyVersion: "v1",
      sourceNameFingerprint: "name-checking",
    },
    kind: "cash",
    lifecycle: "active",
    name: "Checking",
    sourceType: "checking",
    sourceValidAt: observedAt,
    usage: "private",
    ...overrides,
  };
}

function connection(externalId: string, institutionId = "bank-uuid") {
  return {
    active: true,
    externalId,
    institution: { externalId: institutionId, name: "Example Bank" },
    nextTryAt: null,
    sourceErrorCode: null,
    sourceState: null,
    sourceUpdatedAt: observedAt,
  };
}

function source(
  accountsByConnection: Readonly<Record<string, readonly NormalizedAccount[]>>,
): FinancialSource {
  return {
    getExternalSubjectId: async () => "subject-1",
    listAccounts: async (connectionId) => ({
      accounts: accountsByConnection[connectionId] ?? [],
      failures: [],
      isComplete: true,
      reportedTotal: accountsByConnection[connectionId]?.length ?? 0,
    }),
    listConnections: async () => Object.keys(accountsByConnection).map((id) => connection(id)),
  };
}

async function sync(
  repository: ReturnType<typeof createFinancialRepository>,
  financialSource: FinancialSource,
  actionId: string,
) {
  return synchronizeFinancialSource({
    actionId,
    repository,
    source: financialSource,
    sourceKey: "powens-default",
    sourceKind: "powens",
    sourceName: "Powens",
  });
}

test("repairs an existing duplicated account without rewriting history", async ({ db }) => {
  const repository = createFinancialRepository(db);
  await sync(
    repository,
    source({
      "connection-1": [
        account("provider-account-1", "506.62", {
          identity: {
            accountNumberFingerprint: null,
            ibanFingerprint: "old-iban-1",
            keyVersion: "v1",
            sourceNameFingerprint: "name-checking",
          },
        }),
      ],
      "connection-2": [
        account("provider-account-24", "506.62", {
          identity: {
            accountNumberFingerprint: null,
            ibanFingerprint: "old-iban-2",
            keyVersion: "v1",
            sourceNameFingerprint: "name-checking",
          },
        }),
      ],
    }),
    "first",
  );

  const before = await getCurrentWealth(repository, observedAt);
  expect(before.knownTotalAmount).toBe("1013.24000000");

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

  const after = await getCurrentWealth(repository, new Date("2026-08-31T12:00:00Z"));
  expect(after).toMatchObject({
    isComplete: true,
    knownTotalAmount: "507.00000000",
    likelyDuplicateGroupCount: 0,
  });
  const state = await db.execute<{
    active_accounts: number;
    archived_accounts: number;
    confirmed_matches: number;
    references: number;
    snapshots: number;
  }>(sql`
    select
      (select count(*)::int from financial_accounts where archived_at is null) active_accounts,
      (select count(*)::int from financial_accounts where merged_into_account_id is not null) archived_accounts,
      (select count(*)::int from account_identity_matches where classification = 'confirmed_duplicate') confirmed_matches,
      (select count(*)::int from account_source_references) references,
      (select count(*)::int from wealth_snapshots) snapshots
  `);
  expect(state[0]).toEqual({
    active_accounts: 1,
    archived_accounts: 1,
    confirmed_matches: 1,
    references: 2,
    snapshots: 2,
  });
  const historical = await db.execute<{ known_total_amount: string }>(sql`
    select known_total_amount
    from wealth_snapshots
    order by recorded_at asc
    limit 1
  `);
  expect(historical[0]?.known_total_amount).toBe("1013.24000000");
});

test("keeps likely duplicates inclusive and exposes an adjusted estimate", async ({ db }) => {
  const repository = createFinancialRepository(db);
  await sync(
    repository,
    source({
      "connection-1": [
        account("candidate-1", "100", {
          identity: {
            accountNumberFingerprint: null,
            ibanFingerprint: null,
            keyVersion: "v1",
            sourceNameFingerprint: "same-original-name",
          },
        }),
      ],
      "connection-2": [
        account("candidate-2", "90", {
          identity: {
            accountNumberFingerprint: null,
            ibanFingerprint: null,
            keyVersion: "v1",
            sourceNameFingerprint: "same-original-name",
          },
          sourceValidAt: new Date("2026-08-31T11:00:00Z"),
        }),
      ],
    }),
    "candidate",
  );

  const wealth = await getCurrentWealth(repository, new Date("2026-08-31T12:00:00Z"));
  expect(wealth).toMatchObject({
    candidateAdjustedTotalAmount: "90.00000000",
    isComplete: false,
    knownTotalAmount: "190.00000000",
    likelyDuplicateGroupCount: 1,
    possibleTotalMaximum: "190",
    possibleTotalMinimum: "90",
  });
});

test("isolates an account error and falls back to its last successful value", async ({ db }) => {
  const repository = createFinancialRepository(db);
  await sync(repository, source({ "connection-1": [account("cash", "42")] }), "success");
  const failedAccountSource: FinancialSource = {
    getExternalSubjectId: async () => "subject-1",
    listAccounts: async () => ({
      accounts: [],
      failures: [
        {
          externalId: "cash",
          failure: { code: "temporary_account_error", kind: "provider_account" },
        },
      ],
      isComplete: true,
      reportedTotal: 1,
    }),
    listConnections: async () => [connection("connection-1")],
  };

  const result = await sync(repository, failedAccountSource, "partial");
  const wealth = await getCurrentWealth(repository, new Date("2026-08-31T12:00:00Z"));

  expect(result.status).toBe("partial");
  expect(wealth).toMatchObject({
    health: "sync_failed",
    isComplete: false,
    knownTotalAmount: "42.00000000",
    latestSyncStatus: "partial",
  });
  const results = await db.execute<{ status: string }>(sql`
    select status from account_sync_results order by finished_at
  `);
  expect(results.map((row) => row.status)).toEqual(["succeeded", "provider_error"]);
});

test("does not merge same-IBAN pockets with different currencies", async ({ db }) => {
  const repository = createFinancialRepository(db);
  await sync(
    repository,
    source({
      revolut: [
        account("eur-pocket", "10", {
          identity: {
            accountNumberFingerprint: "eur-number",
            ibanFingerprint: "revolut-iban",
            keyVersion: "v1",
            sourceNameFingerprint: "eur-pocket",
          },
        }),
        account("usd-pocket", "20", {
          currency: "USD",
          identity: {
            accountNumberFingerprint: "usd-number",
            ibanFingerprint: "revolut-iban",
            keyVersion: "v1",
            sourceNameFingerprint: "usd-pocket",
          },
        }),
      ],
    }),
    "revolut",
  );

  const counts = await db.execute<{ active_accounts: number; matches: number }>(sql`
    select
      (select count(*)::int from financial_accounts where archived_at is null) active_accounts,
      (select count(*)::int from account_identity_matches) matches
  `);
  expect(counts[0]).toEqual({ active_accounts: 2, matches: 0 });
  const wealth = await getCurrentWealth(repository, observedAt);
  expect(wealth.knownTotalAmount).toBe("10.00000000");
  expect(wealth.institutions[0]?.accounts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        decision: "unsupported_currency",
        reportedAmount: "20.00000000",
        reportedCurrency: "USD",
      }),
    ]),
  );
});

test("infers not-seen only from a complete account listing", async ({ db }) => {
  const repository = createFinancialRepository(db);
  await sync(repository, source({ connection: [account("cash", "42")] }), "success");
  const listingSource = (isComplete: boolean): FinancialSource => ({
    getExternalSubjectId: async () => "subject-1",
    listAccounts: async () => ({
      accounts: [],
      failures: [],
      isComplete,
      reportedTotal: isComplete ? 0 : 1,
    }),
    listConnections: async () => [connection("connection")],
  });

  await sync(repository, listingSource(false), "truncated");
  expect(await getCurrentWealth(repository, observedAt)).toMatchObject({
    isComplete: true,
    knownTotalAmount: "42.00000000",
  });
  let notSeen = await db.execute<{ count: number }>(sql`
    select count(*)::int count from account_sync_results where status = 'not_seen'
  `);
  expect(notSeen[0]?.count).toBe(0);

  await sync(repository, listingSource(true), "complete");
  expect(await getCurrentWealth(repository, observedAt)).toMatchObject({
    isComplete: false,
    knownTotalAmount: "42.00000000",
  });
  notSeen = await db.execute<{ count: number }>(sql`
    select count(*)::int count from account_sync_results where status = 'not_seen'
  `);
  expect(notSeen[0]?.count).toBe(1);
});

test("prevents overlapping runs for one source", async ({ db }) => {
  const repository = createFinancialRepository(db);
  const input = {
    actionId: "first",
    sourceKey: "source",
    sourceKind: "test",
    sourceName: "Test",
  };
  const first = await repository.startRun(input);
  const second = await repository.startRun({ ...input, actionId: "second" });

  expect(first.status).toBe("started");
  expect(second).toEqual({ status: "skipped_already_running" });
  if (first.status === "started") {
    await repository.markRunFailed(first.runId, {
      code: "test_cleanup",
      kind: "test",
    });
  }
});
