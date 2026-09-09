import { expect, test } from "vitest";

import { createApolloGraphqlClient } from "./apollo-client";

test("enables Apollo DevTools only in development", async () => {
  const client = createApolloGraphqlClient({
    uri: "http://graphql.test/api/graphql",
  });

  try {
    expect(client.devtoolsConfig.enabled).toBe(
      process.env.NODE_ENV === "development",
    );
  } finally {
    await client.clearStore();
    client.stop();
  }
});
