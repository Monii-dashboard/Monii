import {
  synchronizeSourceInstance,
  type ExternalFinancialSource,
} from "@monii/ingestion";
import { createPostgresSynchronizationRepository } from "@monii/postgres/ingestion";
import {
  createPostgresWealthCalculationRepository,
  createPostgresWealthQueryRepository,
} from "@monii/postgres/wealth";
import { fakeExternalAccount, fakeExternalConnection } from "@testkit/packages/ingestion";
import { describe } from "@testkit/integration";
import { getIntegrationDatabase } from "@testkit/postgres";
import { sql } from "drizzle-orm";

import { wealthCalculationRepositoryContract } from "./wealth-calculation-repository.contract";

describe("PostgreSQL WealthCalculationRepository", () => {
  wealthCalculationRepositoryContract(async () => {
    const db = getIntegrationDatabase();
    const synchronizationRepository = createPostgresSynchronizationRepository();
    const repository = createPostgresWealthCalculationRepository();
    const queryRepository = createPostgresWealthQueryRepository();

    return {
      repository,
      arrangeIncludedAccount: async (amount: string) => {
        const source: ExternalFinancialSource = {
          getExternalSubjectId: async () => "subject-1",
          listAccounts: async () => ({
            accounts: [fakeExternalAccount({ balance: amount })],
            failures: [],
            isComplete: true,
            reportedTotal: 1,
          }),
          listConnections: async () => [fakeExternalConnection()],
        };
        await synchronizeSourceInstance({
          actionId: "included-account",
          adapterKey: "contract",
          repository: synchronizationRepository,
          source,
          sourceKey: "wealth-calculation-contract",
          sourceName: "Wealth calculation contract",
        });
        const accountId = (await queryRepository.loadCurrentWealthState())
          .snapshot?.accounts[0]?.accountId;
        if (!accountId) throw new Error("Contract account was not persisted");
        return accountId;
      },
      inspectSnapshotDecisions: async () => {
        const decisions = await db.execute<{ decision: string }>(sql`
          select d.decision
          from wealth.snapshot_account_decisions d
          join wealth.snapshots s on s.id = d.snapshot_id
          order by s.recorded_at, s.id
        `);
        return decisions.map(({ decision }) => decision);
      },
      loadCurrentSnapshot: async () =>
        (await queryRepository.loadCurrentWealthState()).snapshot,
    };
  });
});
