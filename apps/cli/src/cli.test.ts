import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { SynchronizationResult } from "@monii/application";
import { getOperationContext } from "@monii/runtime/context";
import { synchronizeFinancialSource } from "@monii/application";
import { createDatabase } from "@monii/server/database";
import { readPowensConfig } from "@monii/server/powens";
import { createFinancialRepository } from "@monii/server/wealth";
import { run } from "@oclif/core";

import Sync from "./commands/sync";
import { runCli } from "./cli";

vi.mock("@monii/application", () => ({ synchronizeFinancialSource: vi.fn() }));
vi.mock("@monii/server/database", () => ({ createDatabase: vi.fn() }));
vi.mock("@monii/server/powens", () => ({
  readPowensConfig: vi.fn(() => ({})),
  createPowensClient: vi.fn(() => ({})),
  createPowensFinancialSource: vi.fn(() => ({})),
}));
vi.mock("@monii/server/wealth", () => ({ createFinancialRepository: vi.fn(() => ({})) }));
vi.mock("@oclif/core", async (importOriginal) => ({
  ...await importOriginal<typeof import("@oclif/core")>(),
  run: vi.fn(),
}));

const close = vi.fn(async () => {});
let records: Record<string, unknown>[];
let errors: ReturnType<typeof vi.spyOn>;
const originalExitCode = process.exitCode;

beforeEach(() => {
  vi.clearAllMocks();
  records = [];
  vi.stubEnv("DATABASE_URL", "postgres://fixture");
  vi.spyOn(console, "log").mockImplementation((value: string) => {
    records.push(JSON.parse(value));
  });
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(createDatabase).mockReturnValue({ db: {} as ReturnType<typeof createDatabase>["db"], close });
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
] as const)("maps %s to exit %i and preserves structured events", async (status, exit) => {
  const result = outcome(status);
  vi.mocked(synchronizeFinancialSource).mockImplementationOnce(async ({ actionId, reporter }) => {
    expect(actionId).toBe(getOperationContext().action_id);
    reporter?.report("sync.connection_failed", { connection_id: "connection-fixture" });
    reporter?.report("sync.connection_completed", { count: 1 });
    return result;
  });
  expect(await runCli(["--", "sync"])).toBe(exit);
  expect(close).toHaveBeenCalledOnce();
  expect(records[0]).toMatchObject({ event: "sync.started", surface: "cli" });
  expect(records[1]).toMatchObject({ event: "sync.connection_failed", level: "error", connection_id: "connection-fixture" });
  expect(records[2]).toMatchObject({ event: "sync.connection_completed", level: "info", count: 1 });
  expect(records[3]).toMatchObject({
    event: exit ? "sync.degraded" : "sync.completed",
    level: exit ? "error" : "info", status,
    run_id: result.runId,
    failed_connection_count: result.failedConnectionCount,
    partial_connection_count: result.partialConnectionCount,
    successful_connection_count: result.successfulConnectionCount,
  });
  expect(new Set(records.map((record) => record.action_id)).size).toBe(1);
  expect(records[0].action_id).toMatch(/^cli-/);
});

test.each([new Error("secret provider payload"), "secret provider payload"])("safely reports thrown values in the original context", async (error) => {
  vi.mocked(synchronizeFinancialSource).mockRejectedValueOnce(error);
  expect(await runCli(["sync"])).toBe(1);
  expect(close).toHaveBeenCalledOnce();
  expect(records.at(-1)).toMatchObject({
    event: "sync.crashed", error_code: "unhandled",
    error_kind: error instanceof Error ? "Error" : "unexpected",
    action_id: records[0].action_id,
  });
  expect(JSON.stringify(records)).not.toContain("secret provider payload");
  expect(errors).not.toHaveBeenCalled();
});

test.each(["config", "repository"])("closes the database when %s initialization fails", async (boundary) => {
  const fail = () => { throw new Error("secret setup details"); };
  if (boundary === "config") vi.mocked(readPowensConfig).mockImplementationOnce(fail);
  else vi.mocked(createFinancialRepository).mockImplementationOnce(fail);
  expect(await runCli(["sync"])).toBe(1);
  expect(close).toHaveBeenCalledOnce();
  expect(synchronizeFinancialSource).not.toHaveBeenCalled();
  expect(records.at(-1)).toMatchObject({ event: "sync.crashed", action_id: records[0].action_id });
});

test.each([false, true])("awaits cleanup before completing (failure: %s)", async (failed) => {
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
  expect(records.at(-1)).toMatchObject({ event: "sync.crashed", action_id: records[0].action_id });
});

test("missing database configuration fails before initialization", async () => {
  vi.stubEnv("DATABASE_URL", "");
  expect(await runCli(["sync"])).toBe(1);
  expect(createDatabase).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
  expect(records[0]).toMatchObject({ event: "sync.crashed", surface: "cli" });
});

test("reports a database initialization failure without attempting cleanup", async () => {
  vi.mocked(createDatabase).mockImplementationOnce(() => {
    throw new Error("secret database details");
  });
  expect(await runCli(["sync"])).toBe(1);
  expect(close).not.toHaveBeenCalled();
  expect(synchronizeFinancialSource).not.toHaveBeenCalled();
  expect(records[0]).toMatchObject({ event: "sync.crashed", surface: "cli" });
  expect(JSON.stringify(records)).not.toContain("secret database details");
});

test("invalid arguments never initialize financial dependencies", async () => {
  expect(await runCli(["sync", "--unknown"])).not.toBe(0);
  expect(createDatabase).not.toHaveBeenCalled();
  expect(readPowensConfig).not.toHaveBeenCalled();
  expect(records).toEqual([]);
  expect(errors).toHaveBeenCalled();
});
