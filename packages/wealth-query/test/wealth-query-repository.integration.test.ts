import {
  synchronizeSourceInstance,
  type ExternalFinancialSource,
} from "@monii/ingestion";
import { createPostgresSynchronizationRepository } from "@monii/postgres/ingestion";
import { createPostgresWealthQueryRepository } from "@monii/postgres/wealth";
import { fakeExternalAccount, fakeExternalConnection } from "@testkit/packages/ingestion";
import { describe } from "@testkit/integration";
import { getIntegrationDatabase } from "@testkit/postgres";
import { sql } from "drizzle-orm";

import { wealthQueryRepositoryContract } from "./wealth-query-repository.contract";

describe("PostgreSQL WealthQueryRepository", () => {
  wealthQueryRepositoryContract(async () => {
    const db = getIntegrationDatabase();
    const synchronizationRepository = createPostgresSynchronizationRepository();
    const repository = createPostgresWealthQueryRepository();
    let synchronizationNumber = 0;

    const synchronize = async (
      source: ExternalFinancialSource,
      prefix: string,
    ) => {
      synchronizationNumber += 1;
      await synchronizeSourceInstance({
        actionId: `${prefix}-${synchronizationNumber}`,
        adapterKey: "contract",
        repository: synchronizationRepository,
        source,
        sourceKey: "wealth-query-contract",
        sourceName: "Wealth query contract",
      });
    };
    const source = (
      listAccounts: ExternalFinancialSource["listAccounts"],
      listConnections: ExternalFinancialSource["listConnections"] =
        async () => [fakeExternalConnection()],
    ): ExternalFinancialSource => ({
      getExternalSubjectId: async () => "subject-1",
      listAccounts,
      listConnections,
    });

    return {
      repository,
      arrangeAccountFailure: () => synchronize(
        source(async () => ({
          accounts: [],
          failures: [{
            externalId: "test-account",
            failure: {
              code: "temporary_account_error",
              kind: "provider_account",
            },
          }],
          isComplete: true,
          reportedTotal: 1,
        })),
        "account-failure",
      ),
      arrangeConnectionFailure: () => synchronize(
        source(
          async () => {
            throw new Error("Account listing must not run for a failed connection");
          },
          async () => [fakeExternalConnection({
            active: false,
            sourceErrorCode: "provider_outage",
          })],
        ),
        "connection-failure",
      ),
      arrangeSuccessfulAccount: (amount: string) => synchronize(
        source(async () => ({
          accounts: [fakeExternalAccount({ balance: amount })],
          failures: [],
          isComplete: true,
          reportedTotal: 1,
        })),
        "successful-account",
      ),
      finalizeEmptyRun: (runId: string) =>
        synchronizationRepository.finalizeRun(runId, "succeeded"),
      inspectObservationHistory: async () => {
        const [counts] = await db.execute<{ observation_count: number }>(sql`
          select count(*)::int observation_count
          from ingestion.external_account_observations
        `);
        const results = await db.execute<{ status: string }>(sql`
          select status
          from ingestion.synchronization_account_results
          order by finished_at, id
        `);
        const snapshots = await db.execute<{ headline_amount: string }>(sql`
          select headline_amount
          from wealth.snapshots
          order by recorded_at, id
        `);
        return {
          accountResultStatuses: results.map(({ status }) => status),
          observationCount: counts?.observation_count ?? 0,
          snapshotHeadlineAmounts: snapshots.map((row) => row.headline_amount),
        };
      },
      startEmptyRun: async () => {
        const started = await synchronizationRepository.startRun({
          actionId: "empty-run",
          adapterKey: "contract",
          sourceKey: "empty-wealth-query-contract",
          sourceName: "Empty wealth query contract",
        });
        if (started.status !== "started") throw new Error("Expected run to start");
        return started.runId;
      },
    };
  });
});
