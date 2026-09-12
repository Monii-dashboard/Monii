import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { SynchronizationResult } from "@monii/ingestion";
import { getOperationContext } from "@monii/runtime/context";
import { synchronizeFinancialSource } from "@monii/financial-refresh";
import { closeDatabase } from "@monii/postgres/client";
import { readPowensConfig } from "@monii/powens";
import { run } from "@oclif/core";

import Sync from "./commands/sync";
import { runCli } from "./cli";

vi.mock("@monii/financial-refresh", () => ({
  synchronizeFinancialSource: vi.fn(),
}));
vi.mock("@monii/postgres/client", () => ({ closeDatabase: vi.fn() }));
vi.mock("@monii/powens", () => ({
  readPowensConfig: vi.fn(() => ({})),
  createPowensClient: vi.fn(() => ({})),
  createPowensFinancialSource: vi.fn(() => ({})),
}));
vi.mock("@oclif/core", async (importOriginal) => ({
  ...await importOriginal<typeof import("@oclif/core")>(),
  run: vi.fn(),
}));

const close = vi.mocked(closeDatabase);
let records: Record<string, unknown>[];
let errors: ReturnType<typeof vi.spyOn>;
const originalExitCode = process.exitCode;

beforeEach(() => {
  vi.clearAllMocks();
  close.mockResolvedValue(undefined);
  records = [];
  vi.spyOn(console, "log").mockImplementation((value: string) => {
    records.push(JSON.parse(value));
  });
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
  // Use the real command lifecycle and parser with mocked financial boundaries.
  // Subprocess tests independently exercise native command discovery.
  vi.mocked(run).mockImplementation(async (args) => {
    return Sync.run(args!.slice(1), new URL("../", import.meta.url).pathname);
  });
});

afterEach(() => {
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function outcome(status: SynchronizationResult["status"]): SynchronizationResult {
  return {
    status, runId: status === "skipped_already_running" ? null : "run-fixture",
    failedConnectionCount: status === "partial" || status === "failed" ? 1 : 0,
    partialConnectionCount: status === "partial" ? 1 : 0,
    successfulConnectionCount: status === "succeeded" || status === "partial" ? 1 : 0,
  };
}

test.each([
  ["succeeded", 0], ["skipped_already_running", 0], ["partial", 1], ["failed", 1],
] as const)("maps %s synchronization to exit code %i", async (status, exit) => {
  vi.mocked(synchronizeFinancialSource).mockResolvedValueOnce(outcome(status));

  expect(await runCli(["--", "sync"])).toBe(exit);
  expect(close).toHaveBeenCalledOnce();
});

test("preserves operation context and redacts provider fields from structured reports", async () => {
  vi.mocked(synchronizeFinancialSource).mockImplementationOnce(async ({ actionId, reporter }) => {
    expect(actionId).toBe(getOperationContext().action_id);
    reporter?.report({
      event: "ingestion.connection.failed",
      fields: { connection_id: "connection-fixture" },
      level: "error",
      message: "Connection failed",
    });
    reporter?.report({
      event: "ingestion.connection.completed",
      fields: {
        count: 1,
        provider_external_id: "must-not-be-logged",
      },
      level: "info",
      message: "Connection completed",
    });
    return outcome("succeeded");
  });

  expect(await runCli(["--", "sync"])).toBe(0);
  expect(close).toHaveBeenCalledOnce();
  expect(records[0]).toMatchObject({ event: "ingestion.connection.failed", level: "error", connection_id: "connection-fixture", message: "Connection failed" });
  expect(records[1]).toMatchObject({ event: "ingestion.connection.completed", level: "info", count: 1, message: "Connection completed" });
  expect(new Set(records.map((record) => record.action_id)).size).toBe(1);
  expect(JSON.stringify(records)).not.toContain("must-not-be-logged");
  expect(records[0].action_id).toMatch(/^cli-/);
});

test.each([
  { error: new Error("secret provider payload"), kind: "Error object" },
  { error: "secret provider payload", kind: "string" },
])("safely reports a thrown $kind in the original context", async ({ error }) => {
  vi.mocked(synchronizeFinancialSource).mockRejectedValueOnce(error);
  expect(await runCli(["sync"])).toBe(1);
  expect(close).toHaveBeenCalledOnce();
  expect(records.at(-1)).toMatchObject({
    event: "ingestion.command.crashed", error_code: "unhandled",
    error_kind: error instanceof Error ? "Error" : "unexpected",
    action_id: records[0].action_id,
  });
  expect(JSON.stringify(records)).not.toContain("secret provider payload");
  expect(errors).not.toHaveBeenCalled();
});

test("closes the database when source configuration fails", async () => {
  const fail = () => { throw new Error("secret setup details"); };
  vi.mocked(readPowensConfig).mockImplementationOnce(fail);
  expect(await runCli(["sync"])).toBe(1);
  expect(close).toHaveBeenCalledOnce();
  expect(synchronizeFinancialSource).not.toHaveBeenCalled();
  expect(records.at(-1)).toMatchObject({ event: "ingestion.command.crashed", action_id: records[0].action_id });
});

test.each([
  { failed: false, outcome: "successful synchronization" },
  { failed: true, outcome: "failed synchronization" },
])("awaits cleanup after $outcome", async ({ failed }) => {
  if (failed) vi.mocked(synchronizeFinancialSource).mockRejectedValueOnce(new Error("sync failed"));
  else vi.mocked(synchronizeFinancialSource).mockResolvedValueOnce(outcome("succeeded"));
  let release!: () => void;
  const cleanup = new Promise<void>((resolve) => { release = resolve; });
  close.mockReturnValueOnce(cleanup);
  let finished = false;
  const pending = runCli(["sync"]).then((code) => { finished = true; return code; });
  await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(finished).toBe(false);
  release();
  expect(await pending).toBe(failed ? 1 : 0);
});

test("reports cleanup failure in the same operation", async () => {
  vi.mocked(synchronizeFinancialSource).mockResolvedValueOnce(outcome("succeeded"));
  close.mockRejectedValueOnce(new Error("secret database details"));
  expect(await runCli(["sync"])).toBe(1);
  expect(records.at(-1)).toMatchObject({ event: "ingestion.command.crashed", action_id: records[0].action_id });
});

test("invalid arguments never initialize financial dependencies", async () => {
  expect(await runCli(["sync", "--unknown"])).not.toBe(0);
  expect(close).not.toHaveBeenCalled();
  expect(readPowensConfig).not.toHaveBeenCalled();
  expect(records).toEqual([]);
  expect(errors).toHaveBeenCalled();
});
