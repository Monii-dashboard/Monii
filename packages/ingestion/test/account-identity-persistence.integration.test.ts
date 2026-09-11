import {
  createPostgresSynchronizationRepository,
} from "@monii/postgres/ingestion";
import { createPostgresWealthQueryRepository } from "@monii/postgres/wealth";
import { getCurrentWealth } from "@monii/wealth-query";
import { describe } from "@testkit/integration";
import { getIntegrationDatabase } from "@testkit/postgres";
import { sql } from "drizzle-orm";

import { accountIdentityPersistenceContract } from "./account-identity-persistence.contract";
import { contractObservedAt } from "./contract-source";

describe("PostgreSQL account and institution persistence", () => {
  accountIdentityPersistenceContract(async () => {
    const db = getIntegrationDatabase();
    const reports: Parameters<
      NonNullable<Parameters<typeof createPostgresSynchronizationRepository>[1]>["report"]
    >[0][] = [];
    const repository = createPostgresSynchronizationRepository(undefined, {
      report: (record) => reports.push(record),
    });
    const queryRepository = createPostgresWealthQueryRepository();

    return {
      repository,
      reports,
      inspectIdentityHistory: async () => {
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
        if (!counts) throw new Error("Identity contract counts were not returned");
        return {
          accountCount: counts.account_count,
          aliasCount: counts.alias_count,
          externalAccountCount: counts.external_account_count,
          snapshotHeadlineAmounts: snapshots.map((row) => row.headline_amount),
        };
      },
      inspectLatestUnknownObservation: async () => {
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
        if (!stored) throw new Error("Unknown observation was not persisted");
        return {
          canonicalName: stored.canonical_name,
          currency: stored.currency,
          rawCurrency: stored.raw_currency,
          reportedName: stored.reported_name,
        };
      },
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
    };
  });
});
