import {
  reconcileFinancialAccounts,
  synchronizeFinancialSource,
} from "@monii/financial-refresh";
import type {
  ExternalFinancialSource,
  FinancialOperationalReport,
  NormalizedExternalAccount,
} from "@monii/ingestion";
import { getCurrentWealth } from "@monii/wealth-query";
import {
  fakeExternalAccount,
  fakeExternalConnection,
} from "@testkit/packages/ingestion";
import { expect, it } from "@testkit/integration";
import { getIntegrationDatabase } from "@testkit/postgres";
import { sql } from "drizzle-orm";

import { AccountMatchAssessment } from "../models";

const observedAt = new Date("2026-08-31T10:00:00Z");

function source(
  accountsByConnection: Readonly<
    Record<string, readonly NormalizedExternalAccount[]>
  >,
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
      Object.keys(accountsByConnection).map((externalId) =>
        fakeExternalConnection({
          externalId,
          institution: {
            externalId: "shared-institution",
            reportedName: "Example Bank",
          },
        })
      ),
  };
}

function duplicateCandidate(
  externalId: string,
  amount: string,
  ibanFingerprint: string | null,
): NormalizedExternalAccount {
  return fakeExternalAccount({
    balance: amount,
    externalId,
    identity: {
      accountNumberFingerprint: null,
      ibanFingerprint,
      keyVersion: "v1",
      reportedNameFingerprint: "name-checking",
    },
    sourceValidAt: observedAt,
  });
}

async function synchronize(
  accountsByConnection: Readonly<
    Record<string, readonly NormalizedExternalAccount[]>
  >,
  actionId: string,
  reports: FinancialOperationalReport[] = [],
) {
  return synchronizeFinancialSource({
    actionId,
    adapterKey: "test",
    reporter: { report: (record) => reports.push(record) },
    source: source(accountsByConnection),
    sourceKey: "account-reconciliation",
    sourceName: "Account reconciliation",
  });
}

it("promotes a likely duplicate to a confirmed identity and publishes a canonical snapshot without rewriting history", async () => {
  const db = getIntegrationDatabase();
  const reports: FinancialOperationalReport[] = [];
  await synchronize(
    {
      "connection-1": [duplicateCandidate("provider-1", "506.62", null)],
      "connection-2": [duplicateCandidate("provider-2", "506.62", null)],
    },
    "weak-evidence",
    reports,
  );

  await expect(getCurrentWealth(observedAt)).resolves.toMatchObject({
    duplicateAdjustedEstimateAmount: "506.62000000",
    headlineAmount: "1013.24000000",
    likelyDuplicateGroupCount: 1,
  });

  await synchronize(
    {
      "connection-1": [
        duplicateCandidate("provider-1", "506.62", "iban-shared"),
      ],
      "connection-2": [
        {
          ...duplicateCandidate("provider-2", "507", "iban-shared"),
          sourceValidAt: new Date("2026-08-31T11:00:00Z"),
        },
      ],
    },
    "strong-evidence",
    reports,
  );

  await expect(getCurrentWealth(observedAt)).resolves.toMatchObject({
    headlineAmount: "507.00000000",
    isComplete: true,
    likelyDuplicateGroupCount: 0,
  });
  const snapshots = await db.execute<{ headline_amount: string }>(sql`
    select headline_amount
    from wealth.snapshots
    order by recorded_at, id
  `);
  expect(snapshots.map((row) => row.headline_amount)).toEqual([
    "1013.24000000",
    "507.00000000",
  ]);
  expect(reports).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ event: "accounts.merge.completed" }),
      expect.objectContaining({ event: "wealth.snapshot.created" }),
    ]),
  );
});

it("reconciles independently without inventing a persisted reconciliation run", async () => {
  await synchronize(
    {
      "connection-1": [duplicateCandidate("provider-1", "40", null)],
      "connection-2": [duplicateCandidate("provider-2", "40", null)],
    },
    "initial-synchronization",
  );
  const [duringSynchronization] = await AccountMatchAssessment.findMany();
  if (!duringSynchronization) throw new Error("Expected a match assessment");
  await AccountMatchAssessment.delete(duringSynchronization.id);

  await expect(
    reconcileFinancialAccounts({
      actionId: "operator-reconciliation",
      reason: "operator_requested",
    }),
  ).resolves.toMatchObject({ changed: true, snapshotId: expect.any(String) });

  const [independentAssessment] = await AccountMatchAssessment.findMany();
  expect(independentAssessment).toMatchObject({
    classification: "likely_duplicate",
    firstDetectedSynchronizationRunId: null,
    lastDetectedSynchronizationRunId: null,
  });
});
