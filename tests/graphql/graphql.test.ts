import { CombinedGraphQLErrors } from "@apollo/client/errors";
import { expect, test } from "vitest";

import {
  createGraphqlServer,
  graphqlSchema,
} from "@monii/server/graphql";
import type { Log } from "@monii/runtime/log";

import { createApolloGraphqlClient } from "../../apps/web/src/graphql/client/apollo-client";
import { normalizeGraphqlError } from "../../apps/web/src/graphql/client/errors";

import {
  graphqlTestFailureDocument,
  graphqlTestMutationDocument,
  graphqlTestQueryDocument,
  graphqlTestSlowDocument,
  graphqlTestUnknownErrorCodeDocument,
} from "./operations";
import { testGraphqlSchema, testGraphqlState } from "./schema";

function createInMemoryFetch(
  server: ReturnType<typeof createGraphqlServer>,
): typeof fetch {
  return async (input, init) =>
    await server.fetch(new Request(input, init));
}

function createTestClient(timeoutMs = 30_000) {
  const serverErrors: string[] = [];
  const captureLog = (...args: unknown[]) => {
    const message = typeof args[0] === "string" ? args[0] : undefined;
    const event = typeof args[1] === "string" ? args[1] : undefined;
    const fields = (typeof args[0] === "object" ? args[0] : args[2] ?? args[1]) as Record<
      string,
      unknown
    >;

    serverErrors.push(
      JSON.stringify({
        ...fields,
        ...(message === undefined ? {} : { message }),
        ...(event === undefined ? {} : { event }),
      }),
    );
  };
  const logger = Object.assign(captureLog, {
    info: captureLog,
    warning: captureLog,
    error: captureLog,
  }) as Log;
  const server = createGraphqlServer({
    schema: testGraphqlSchema,
    logger,
  });
  const client = createApolloGraphqlClient({
    uri: "http://graphql.test/api/graphql",
    fetchImplementation: createInMemoryFetch(server),
    reportError: () => undefined,
    timeoutMs,
  });

  return { client, serverErrors };
}

test("serves only the production health query", async () => {
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
  expect(result.errors?.[0]?.message).toContain("testEcho");

  const healthResponse = await server.fetch(
    "http://graphql.test/api/graphql",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "query Health { _health }" }),
    },
  );

  await expect(healthResponse.json()).resolves.toMatchObject({
    data: { _health: true },
  });
});

test("executes generated query and mutation documents in memory", async () => {
  const { client } = createTestClient();

  try {
    const queryResult = await client.query({
      query: graphqlTestQueryDocument,
      variables: { value: "typesafe" },
      fetchPolicy: "no-cache",
    });
    const mutationResult = await client.mutate({
      mutation: graphqlTestMutationDocument,
      variables: { value: "monii" },
    });

    expect(queryResult.data?.testEcho).toBe("typesafe");
    expect(mutationResult.data?.testReverse).toBe("iinom");
  } finally {
    await client.clearStore();
    client.stop();
  }
});

test("preserves public codes and masks unexpected errors", async () => {
  const { client, serverErrors } = createTestClient();

  try {
    const expectedResult = await client.query({
      query: graphqlTestFailureDocument,
      variables: { unexpected: false },
      fetchPolicy: "no-cache",
    });
    const unexpectedResult = await client.query({
      query: graphqlTestFailureDocument,
      variables: { unexpected: true },
      fetchPolicy: "no-cache",
    });
    const unknownCodeResult = await client.query({
      query: graphqlTestUnknownErrorCodeDocument,
      fetchPolicy: "no-cache",
    });

    expect(CombinedGraphQLErrors.is(expectedResult.error)).toBe(true);
    expect(normalizeGraphqlError(expectedResult.error)).toMatchObject({
      code: "BAD_USER_INPUT",
      kind: "graphql",
      message: "Expected test failure.",
    });
    expect(normalizeGraphqlError(unexpectedResult.error)).toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      kind: "graphql",
      message: "Internal server error.",
    });
    expect(normalizeGraphqlError(unknownCodeResult.error)).toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      kind: "graphql",
      message: "Internal server error.",
    });
    expect(CombinedGraphQLErrors.is(unknownCodeResult.error)).toBe(true);
    if (!CombinedGraphQLErrors.is(unknownCodeResult.error)) {
      throw new Error("Expected a GraphQL error result.");
    }
    expect(unknownCodeResult.error.errors[0]?.extensions).not.toHaveProperty(
      "privateDetail",
    );
    expect(serverErrors).toHaveLength(2);
    expect(serverErrors[0]).toContain("graphql.unexpected_error");
    expect(serverErrors[0]).toContain("private test failure");
    expect(serverErrors[1]).toContain("graphql.unexpected_error");
    expect(serverErrors[1]).toContain("private coded failure");
  } finally {
    await client.clearStore();
    client.stop();
  }
});

test("aborts GraphQL execution at the client deadline", async () => {
  const { client } = createTestClient(10);
  testGraphqlState.slowResolverAbortCount = 0;

  try {
    let operationError: unknown;

    try {
      const result = await client.query({
        query: graphqlTestSlowDocument,
        variables: { delayMs: 1_000 },
        fetchPolicy: "no-cache",
      });
      operationError = result.error;
    } catch (error) {
      operationError = error;
    }

    expect(normalizeGraphqlError(operationError)).toMatchObject({
      code: "TIMEOUT",
      kind: "timeout",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(testGraphqlState.slowResolverAbortCount).toBe(1);
  } finally {
    await client.clearStore();
    client.stop();
  }
});
