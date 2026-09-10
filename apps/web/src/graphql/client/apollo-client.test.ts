import { afterEach, expect, onTestFinished, test, vi } from "vitest";

import { createApolloGraphqlClient } from "./apollo-client";

afterEach(() => {
  vi.unstubAllEnvs();
});

test.each([
  { enabled: true, nodeEnv: "development" },
  { enabled: false, nodeEnv: "test" },
  { enabled: false, nodeEnv: "production" },
])("sets Apollo DevTools to $enabled when NODE_ENV is $nodeEnv", async ({
  enabled,
  nodeEnv,
}) => {
  vi.stubEnv("NODE_ENV", nodeEnv);
  const client = createApolloGraphqlClient({
    uri: "http://graphql.test/api/graphql",
  });
  onTestFinished(async () => {
    await client.clearStore();
    client.stop();
  });

  expect(client.devtoolsConfig.enabled).toBe(enabled);
});
