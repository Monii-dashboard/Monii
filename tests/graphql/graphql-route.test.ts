import { expect, test } from "vitest";

import { POST } from "../../apps/web/src/app/api/graphql/route";
import { executeJsonRoute } from "../http/route";

test("serves the health query through the application route", async () => {
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
});
