import { setTimeout as sleep } from "node:timers/promises";

import { expect, test, vi } from "vitest";

import { getOperationContext } from "@monii/runtime/context";
import { log } from "@monii/runtime/log";
import { runWithOperationContext } from "@monii/runtime/operation";

test("provides operation context throughout asynchronous work", async () => {
  await runWithOperationContext({ surface: "web" }, async () => {
    const context = getOperationContext();
    expect(context.surface).toBe("web");
    expect(context.action_id).toMatch(/^web-/);
    await sleep(0);
    expect(getOperationContext()).toEqual(context);
  });
});

test("identifies console sessions as operations", () => {
  runWithOperationContext({ surface: "console" }, () => {
    expect(getOperationContext().surface).toBe("console");
    expect(getOperationContext().action_id).toMatch(/^console-/);
  });
});

test("isolates concurrent operation contexts", async () => {
  let releaseFirst: () => void = () => undefined;
  const firstCanFinish = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });

  const first = runWithOperationContext(
    { surface: "web" },
    async () => {
      await firstCanFinish;
      expect(getOperationContext().surface).toBe("web");
    },
  );
  const second = runWithOperationContext(
    { surface: "cli" },
    async () => {
      expect(getOperationContext().surface).toBe("cli");
      releaseFirst();
    },
  );

  await Promise.all([first, second]);
});

test("fails when context is accessed outside an operation", () => {
  expect(() => getOperationContext()).toThrow(
    "Operation context is not available outside an operation",
  );
  expect(() => log({ event: "outside.operation" })).toThrow(
    "Operation context is not available outside an operation",
  );
});

test("logs structured records with protected operation fields", () => {
  const consoleLog = vi
    .spyOn(globalThis.console, "log")
    .mockImplementation(() => {});

  try {
    runWithOperationContext(
      { surface: "web" },
      () =>
        log.info("Wealth calculated", "wealth.calculated", {
          action_id: "cannot-override",
          account_count: 3,
          surface: "cli",
        }),
    );

    expect(consoleLog).toHaveBeenCalledTimes(1);
    const record = JSON.parse(String(consoleLog.mock.calls[0]?.[0]));
    expect(record).toMatchObject({
      account_count: 3,
      event: "wealth.calculated",
      level: "info",
      surface: "web",
    });
    expect(record.message).toBe("Wealth calculated");
    expect(record.action_id).toMatch(/^web-/);
  } finally {
    consoleLog.mockRestore();
  }
});

test("supports structured-only and severity-specific logging", () => {
  const consoleLog = vi
    .spyOn(globalThis.console, "log")
    .mockImplementation(() => {});

  try {
    runWithOperationContext({ surface: "cli" }, () => {
      log({ body: { account_count: 2 } });
      log.warning("Partial synchronization", "sync.partial", {
        body: { account_count: 1 },
      });
      log.error({ event: "sync.failed", body: { retryable: true } });
    });

    expect(consoleLog).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String(consoleLog.mock.calls[0]?.[0]))).toMatchObject({
      level: "info",
      body: { account_count: 2 },
    });
    expect(JSON.parse(String(consoleLog.mock.calls[1]?.[0]))).toMatchObject({
      level: "warn",
      message: "Partial synchronization",
      event: "sync.partial",
    });
    expect(JSON.parse(String(consoleLog.mock.calls[2]?.[0]))).toMatchObject({
      level: "error",
      event: "sync.failed",
    });
  } finally {
    consoleLog.mockRestore();
  }
});
