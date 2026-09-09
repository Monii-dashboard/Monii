import { describe, expect, test, vi } from "vitest";

import type { ExternalFinancialSource } from "./external-financial-source";
import {
  synchronizeSourceInstance,
  type FinancialOperationalReport,
  type SynchronizationRepository,
} from "./synchronize-source-instance";

function repository(): SynchronizationRepository {
  return {
    finalizeRun: vi.fn(async () => undefined),
    identifyRunSource: vi.fn(async () => undefined),
    markRunFailed: vi.fn(async () => undefined),
    recordConnectionFailure: vi.fn(async () => undefined),
    recordConnectionResult: vi.fn(async () => ({
      failedAccountCount: 0,
      status: "succeeded" as const,
      successfulAccountCount: 0,
    })),
    startRun: vi.fn(async () => ({ runId: "run-1", status: "started" as const })),
  };
}

function connection(externalId: string) {
  return {
    active: true,
    externalId,
    institution: {
      externalId: `institution-${externalId}`,
      reportedName: "Bank",
    },
    nextTryAt: null,
    sourceErrorCode: null,
    sourceState: null,
    sourceUpdatedAt: null,
  };
}

describe("synchronization orchestration", () => {
  test("isolates failed and partial connections then finalizes once", async () => {
    const persistence = repository();
    vi.mocked(persistence.recordConnectionResult).mockResolvedValueOnce({
      failedAccountCount: 1,
      status: "partial",
      successfulAccountCount: 2,
    });
    const source: ExternalFinancialSource = {
      getExternalSubjectId: async () => "subject-1",
      listAccounts: async (externalId) => {
        if (externalId === "2") throw { code: "temporary", kind: "api" };
        return { accounts: [], failures: [], isComplete: true, reportedTotal: 0 };
      },
      listConnections: async () => [connection("1"), connection("2")],
    };

    await expect(
      synchronizeSourceInstance({
        actionId: "action",
        adapterKey: "test",
        repository: persistence,
        source,
        sourceKey: "source",
        sourceName: "Test",
      }),
    ).resolves.toMatchObject({
      failedConnectionCount: 1,
      partialConnectionCount: 1,
      status: "partial",
    });
    expect(persistence.finalizeRun).toHaveBeenCalledOnce();
  });

  test("reports orchestration decisions with a level, event, and message", async () => {
    const reports: FinancialOperationalReport[] = [];
    await synchronizeSourceInstance({
      actionId: "action",
      adapterKey: "test",
      reporter: { report: (record) => reports.push(record) },
      repository: repository(),
      source: {
        getExternalSubjectId: async () => "subject-1",
        listAccounts: async () => ({
          accounts: [],
          failures: [],
          isComplete: true,
          reportedTotal: 0,
        }),
        listConnections: async () => [connection("1")],
      },
      sourceKey: "source",
      sourceName: "Test",
    });

    expect(reports.map((record) => record.event)).toEqual([
      "ingestion.run.started",
      "ingestion.connection.completed",
      "ingestion.run.completed",
    ]);
    expect(
      reports.every(
        (record) => record.message.length > 0 && record.level.length > 0,
      ),
    ).toBe(true);
  });

  test("skips an overlapping run without calling the provider", async () => {
    const persistence = repository();
    vi.mocked(persistence.startRun).mockResolvedValue({
      status: "skipped_already_running",
    });
    const source: ExternalFinancialSource = {
      getExternalSubjectId: vi.fn(async () => "unused"),
      listAccounts: vi.fn(),
      listConnections: vi.fn(),
    };

    const result = await synchronizeSourceInstance({
      actionId: "action",
      adapterKey: "test",
      repository: persistence,
      source,
      sourceKey: "source",
      sourceName: "Test",
    });
    expect(result.status).toBe("skipped_already_running");
    expect(source.getExternalSubjectId).not.toHaveBeenCalled();
  });
});
