import { expect, test, vi } from "vitest";

import { POST } from "../../apps/web/src/app/api/graphql/route";
import { executeJsonRoute } from "../http/route";

test("serves the health query through the application route", async () => {
  const consoleLog = vi
    .spyOn(globalThis.console, "log")
    .mockImplementation(() => {});

  try {
    const response = await executeJsonRoute(POST, {
      path: "/api/graphql",
      method: "POST",
      body: {
        query: "query RouteHealth { _health }",
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { _health: true },
    });

    const record = JSON.parse(String(consoleLog.mock.calls[0]?.[0])) as {
      action_id: string;
      event: string;
      surface: string;
    };
    expect(record).toMatchObject({
      event: "graphql.request.started",
      surface: "web",
    });
    expect(record.action_id).toBeTruthy();
  } finally {
    consoleLog.mockRestore();
  }
});
