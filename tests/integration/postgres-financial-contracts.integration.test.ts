import { accountIdentityPersistenceContract } from "../../packages/ingestion/test/account-identity-persistence.contract";
import {
  contractAccount,
  contractConnection,
  contractObservedAt,
  contractSource,
} from "../../packages/ingestion/test/contract-source";
import { synchronizationRepositoryContract } from "../../packages/ingestion/test/synchronization-repository.contract";
import { wealthCalculationRepositoryContract } from "../../packages/wealth-calculation/test/wealth-calculation-repository.contract";
import { wealthQueryRepositoryContract } from "../../packages/wealth-query/test/wealth-query-repository.contract";
import {
  synchronizeSourceInstance,
  type ExternalFinancialSource,
  type FinancialOperationalReport,
} from "@monii/ingestion";
import { createPostgresSynchronizationRepository } from "@monii/postgres/ingestion";
import {
  createPostgresWealthCalculationRepository,
  createPostgresWealthQueryRepository,
} from "@monii/postgres/wealth";
import { getCurrentWealth } from "@monii/wealth-query";
import { sql } from "drizzle-orm";
import { onTestFinished } from "vitest";

import { startPostgresTestDatabase } from "../support/postgres";

async function createPostgresContractHarness() {
  const testDatabase = await startPostgresTestDatabase();
  onTestFinished(() => testDatabase.stop());

  const reports: FinancialOperationalReport[] = [];
  const synchronizationRepository = createPostgresSynchronizationRepository(
    testDatabase.db,
    { report: (record) => reports.push(record) },
  );
  const calculationRepository = createPostgresWealthCalculationRepository(
    testDatabase.db,
  );
  const queryRepository = createPostgresWealthQueryRepository(testDatabase.db);
  const repository = {
    changeAccountInclusionPolicy:
      calculationRepository.changeAccountInclusionPolicy,
    finalizeRun: synchronizationRepository.finalizeRun,
    identifyRunSource: synchronizationRepository.identifyRunSource,
    loadCurrentWealthState: queryRepository.loadCurrentWealthState,
    markRunFailed: synchronizationRepository.markRunFailed,
    recordConnectionFailure: synchronizationRepository.recordConnectionFailure,
    recordConnectionResult: synchronizationRepository.recordConnectionResult,
    startRun: synchronizationRepository.startRun,
  };
  let synchronizationNumber = 0;

  const synchronize = async (
    source: ExternalFinancialSource,
    prefix: string,
  ) => {
    synchronizationNumber += 1;
    return synchronizeSourceInstance({
      actionId: `${prefix}-${synchronizationNumber}`,
      adapterKey: "contract",
      repository: synchronizationRepository,
      source,
      sourceKey: "financial-contract",
      sourceName: "Financial contract",
    });
  };

  return {
    repository,
    reports,
    arrangeAccountFailure: async () => {
      const source: ExternalFinancialSource = {
        getExternalSubjectId: async () => "subject-1",
        listAccounts: async () => ({
          accounts: [],
          failures: [{
            externalId: "cash",
            failure: {
              code: "temporary_account_error",
              kind: "provider_account",
            },
          }],
          isComplete: true,
          reportedTotal: 1,
        }),
        listConnections: async () => [contractConnection("connection")],
      };
      await synchronize(source, "account-failure");
    },
    arrangeConnectionFailure: async () => {
      const source: ExternalFinancialSource = {
        getExternalSubjectId: async () => "subject-1",
        listAccounts: async () => {
          throw new Error("Account listing must not run for a failed connection");
        },
        listConnections: async () => [{
          ...contractConnection("connection"),
          active: false,
          sourceErrorCode: "provider_outage",
        }],
      };
      await synchronize(source, "connection-failure");
    },
    arrangeIncludedAccount: async (amount: string) => {
      await synchronize(
        contractSource({ connection: [contractAccount("cash", amount)] }),
        "included-account",
      );
      const state = await queryRepository.loadCurrentWealthState();
      const accountId = state.snapshot?.accounts[0]?.accountId;
      if (!accountId) throw new Error("Contract account was not persisted");
      return accountId;
    },
    arrangeSuccessfulAccount: async (amount: string) => {
      await synchronize(
        contractSource({ connection: [contractAccount("cash", amount)] }),
        "successful-account",
      );
    },
    finalizeEmptyRun: (runId: string) =>
      synchronizationRepository.finalizeRun(runId, "succeeded"),
    inspectIdentityHistory: async () => {
      const [counts] = await testDatabase.db.execute<{
        account_count: number;
        alias_count: number;
        external_account_count: number;
      }>(sql`
        select
          (select count(*)::int from financial.accounts) account_count,
          (select count(*)::int from financial.account_merges) alias_count,
          (select count(*)::int from ingestion.external_accounts) external_account_count
      `);
      const snapshots = await testDatabase.db.execute<{ headline_amount: string }>(
        sql`
          select headline_amount
          from wealth.snapshots
          order by recorded_at, id
        `,
      );
      if (!counts) throw new Error("Identity contract counts were not returned");
      return {
        accountCount: counts.account_count,
        aliasCount: counts.alias_count,
        externalAccountCount: counts.external_account_count,
        snapshotHeadlineAmounts: snapshots.map((row) => row.headline_amount),
      };
    },
    inspectLatestUnknownObservation: async () => {
      const [stored] = await testDatabase.db.execute<{
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
      if (!stored) throw new Error("Unknown observation was not persisted");
      return {
        canonicalName: stored.canonical_name,
        currency: stored.currency,
        rawCurrency: stored.raw_currency,
        reportedName: stored.reported_name,
      };
    },
    inspectObservationHistory: async () => {
      const [counts] = await testDatabase.db.execute<{ observation_count: number }>(
        sql`
          select count(*)::int observation_count
          from ingestion.external_account_observations
        `,
      );
      const results = await testDatabase.db.execute<{ status: string }>(sql`
        select status
        from ingestion.synchronization_account_results
        order by finished_at, id
      `);
      const snapshots = await testDatabase.db.execute<{ headline_amount: string }>(
        sql`
          select headline_amount
          from wealth.snapshots
          order by recorded_at, id
        `,
      );
      return {
        accountResultStatuses: results.map(({ status }) => status),
        observationCount: counts?.observation_count ?? 0,
        snapshotHeadlineAmounts: snapshots.map((row) => row.headline_amount),
      };
    },
    inspectSnapshotDecisions: async () => {
      const decisions = await testDatabase.db.execute<{ decision: string }>(sql`
        select d.decision
        from wealth.snapshot_account_decisions d
        join wealth.snapshots s on s.id = d.snapshot_id
        order by s.recorded_at, s.id
      `);
      return decisions.map(({ decision }) => decision);
    },
    loadCurrentSnapshot: async () =>
      (await queryRepository.loadCurrentWealthState()).snapshot,
    loadCurrentWealth: async () => {
      const wealth = await getCurrentWealth(queryRepository, contractObservedAt);
      return {
        accounts: wealth.institutions.flatMap(({ accounts }) => accounts),
        headlineAmount: wealth.headlineAmount,
        institutionCount: wealth.institutions.length,
        isComplete: wealth.isComplete,
        likelyDuplicateGroupCount: wealth.likelyDuplicateGroupCount,
      };
    },
    startEmptyRun: async () => {
      const started = await synchronizationRepository.startRun({
        actionId: "empty-run",
        adapterKey: "contract",
        sourceKey: "empty-contract",
        sourceName: "Empty contract",
      });
      if (started.status !== "started") throw new Error("Expected run to start");
      return started.runId;
    },
  };
}

synchronizationRepositoryContract(createPostgresContractHarness);
accountIdentityPersistenceContract(createPostgresContractHarness);
wealthQueryRepositoryContract(createPostgresContractHarness);
wealthCalculationRepositoryContract(createPostgresContractHarness);
