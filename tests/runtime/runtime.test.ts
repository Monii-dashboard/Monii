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

test("formats colored, human-readable logs when enabled locally", () => {
  const consoleLog = vi
    .spyOn(globalThis.console, "log")
    .mockImplementation(() => {});
  const previousSetting = process.env.MONII_PRETTY_LOGS;
  process.env.MONII_PRETTY_LOGS = "true";

  try {
    runWithOperationContext({ surface: "cli" }, () => {
      log.warning("Partial synchronization", "sync.partial", {
        account_count: 1,
      });
    });

    const output = String(consoleLog.mock.calls[0]?.[0]);
    expect(output).toMatch(/^\u001B\[2m\d{4}-\d{2}-\d{2}T/);
    expect(output).toContain("\u001B[33mWARN ");
    expect(output).toContain("[cli]");
    expect(output).toContain("sync.partial");
    expect(output).toContain("Partial synchronization");
    expect(output).toContain('{"account_count":1}');
  } finally {
    if (previousSetting === undefined) {
      delete process.env.MONII_PRETTY_LOGS;
    } else {
      process.env.MONII_PRETTY_LOGS = previousSetting;
    }
    consoleLog.mockRestore();
  }
});

test("redacts sensitive identity fields and serializes errors safely", () => {
  const consoleLog = vi
    .spyOn(globalThis.console, "log")
    .mockImplementation(() => {});

  try {
    runWithOperationContext({ surface: "cli" }, () => {
      log.error("Safe failure", "sync.failed", {
        account_number: "raw-account-number",
        error: new Error("provider response containing sensitive details"),
        iban: "raw-iban",
        nested: { access_token: "raw-nested-token" },
        token: "raw-token",
      });
    });

    const serialized = String(consoleLog.mock.calls[0]?.[0]);
    const record = JSON.parse(serialized);
    expect(record).toMatchObject({
      account_number: "[redacted]",
      error: { name: "Error" },
      iban: "[redacted]",
      nested: { access_token: "[redacted]" },
      token: "[redacted]",
    });
    expect(serialized).not.toContain("raw-");
    expect(serialized).not.toContain("provider response");
  } finally {
    consoleLog.mockRestore();
  }
});
