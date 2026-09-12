import { expect, it } from "@testkit/integration";

import { createGraphqlServer, graphqlSchema } from "./index";

it("excludes test-only fields from the production schema", async () => {
  const server = createGraphqlServer({ schema: graphqlSchema });
  const response = await server.fetch("http://graphql.test/api/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: "query ProductionSchema { _health testEcho(value: \"nope\") }",
    }),
  });
  const result = (await response.json()) as {
    data?: { _health: boolean };
    errors?: Array<{ message: string }>;
  };

  expect(result.data).toBeUndefined();
  expect(result.errors?.[0]?.message).toBe(
    'Cannot query field "testEcho" on type "Query".',
  );
});
