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
  expect(() => log("outside.operation")).toThrow(
    "Operation context is not available outside an operation",
  );
});

test("logs structured events with protected operation fields", () => {
  const consoleLog = vi
    .spyOn(globalThis.console, "log")
    .mockImplementation(() => {});

  try {
    runWithOperationContext(
      { surface: "web" },
      () =>
        log("wealth.calculated", {
          action_id: "cannot-override",
          account_count: 3,
          event: "cannot.override",
          surface: "cli",
        }),
    );

    expect(consoleLog).toHaveBeenCalledTimes(1);
    const record = JSON.parse(String(consoleLog.mock.calls[0]?.[0]));
    expect(record).toMatchObject({
      account_count: 3,
      event: "wealth.calculated",
      surface: "web",
    });
    expect(record.action_id).toMatch(/^web-/);
  } finally {
    consoleLog.mockRestore();
  }
});
