import { setTimeout as sleep } from "node:timers/promises";

import { expect, test, vi } from "vitest";

import { getOperationContext } from "@monii/runtime/context";
import { log } from "@monii/runtime/log";
import { runWithOperationContext } from "@monii/runtime/operation";

test("provides operation context throughout asynchronous work", async () => {
  const context = { action_id: "action-1", surface: "web" } as const;

  await runWithOperationContext(context, async () => {
    expect(getOperationContext()).toEqual(context);
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
    { action_id: "action-1", surface: "web" },
    async () => {
      await firstCanFinish;
      expect(getOperationContext()).toEqual({
        action_id: "action-1",
        surface: "web",
      });
    },
  );
  const second = runWithOperationContext(
    { action_id: "action-2", surface: "cli" },
    async () => {
      expect(getOperationContext()).toEqual({
        action_id: "action-2",
        surface: "cli",
      });
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
      { action_id: "action-1", surface: "web" },
      () =>
        log("wealth.calculated", {
          action_id: "cannot-override",
          account_count: 3,
          event: "cannot.override",
          surface: "cli",
        }),
    );

    expect(consoleLog).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(consoleLog.mock.calls[0]?.[0]))).toEqual({
      account_count: 3,
      event: "wealth.calculated",
      action_id: "action-1",
      surface: "web",
    });
  } finally {
    consoleLog.mockRestore();
  }
});
