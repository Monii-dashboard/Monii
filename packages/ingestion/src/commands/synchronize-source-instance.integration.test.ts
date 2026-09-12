import { getCurrentWealth } from "@monii/wealth-query";
import { fakeExternalAccount, fakeExternalConnection } from "@testkit/packages/ingestion";
import { expect, it, vi } from "@testkit/integration";

import type { ExternalFinancialSource } from "../external-financial-source";
import type { FinancialOperationalReport } from "../reporting";
import { startSynchronizationRun } from "../internal/commands/start-synchronization-run";
import { synchronizeSourceInstance } from "./synchronize-source-instance";

it("persists useful connections when another connection fails", async () => {
  const reports: FinancialOperationalReport[] = [];
  const source: ExternalFinancialSource = {
    getExternalSubjectId: async () => "subject-1",
    listAccounts: async (connectionId) => {
      if (connectionId === "failed") {
        throw { code: "temporary", kind: "api" };
      }
      return {
        accounts: [fakeExternalAccount({ balance: "42" })],
        failures: [],
        isComplete: true,
        reportedTotal: 1,
      };
    },
    listConnections: async () => [
      fakeExternalConnection({ externalId: "useful" }),
      fakeExternalConnection({ externalId: "failed" }),
    ],
  };

  await expect(
    synchronizeSourceInstance({
      actionId: "partial-synchronization",
      adapterKey: "test",
      reporter: { report: (record) => reports.push(record) },
      source,
      sourceKey: "partial-source",
      sourceName: "Partial source",
    }),
  ).resolves.toMatchObject({
    failedConnectionCount: 1,
    partialConnectionCount: 0,
    status: "partial",
    successfulConnectionCount: 1,
  });
  await expect(getCurrentWealth()).resolves.toMatchObject({
    headlineAmount: "42.00000000",
    latestSynchronizationStatus: "partial",
  });
  expect(reports).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ event: "ingestion.connection.failed" }),
      expect.objectContaining({ event: "ingestion.connection.completed" }),
      expect.objectContaining({ event: "ingestion.run.completed" }),
    ]),
  );
});

it("does not call the source when another synchronization is active", async () => {
  await startSynchronizationRun({
    actionId: "active",
    adapterKey: "test",
    sourceKey: "overlapping-source",
    sourceName: "Overlapping source",
  });
  const source: ExternalFinancialSource = {
    getExternalSubjectId: vi.fn(),
    listAccounts: vi.fn(),
    listConnections: vi.fn(),
  };

  await expect(
    synchronizeSourceInstance({
      actionId: "overlap",
      adapterKey: "test",
      source,
      sourceKey: "overlapping-source",
      sourceName: "Overlapping source",
    }),
  ).resolves.toMatchObject({ status: "skipped_already_running" });
  expect(source.getExternalSubjectId).not.toHaveBeenCalled();
  expect(source.listConnections).not.toHaveBeenCalled();
});
