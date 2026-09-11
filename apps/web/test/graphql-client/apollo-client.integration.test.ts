import { CombinedGraphQLErrors } from "@apollo/client/errors";
import { createGraphqlServer } from "@monii/graphql";
import type { Log } from "@monii/runtime/log";
import { afterEach, expect, it, vi } from "@testkit/integration";

import { createApolloGraphqlClient } from "../../src/graphql/client/apollo-client";
import { normalizeGraphqlError } from "../../src/graphql/client/errors";
import {
  graphqlTestFailureDocument,
  graphqlTestMutationDocument,
  graphqlTestQueryDocument,
  graphqlTestSlowDocument,
  graphqlTestUnknownErrorCodeDocument,
} from "../../test-support/graphql-client/operations";
import {
  testGraphqlSchema,
  testGraphqlState,
} from "../../test-support/graphql-client/schema";

afterEach(() => {
  testGraphqlState.slowResolverAbortCount = 0;
  vi.restoreAllMocks();
});

function createInMemoryFetch(
  server: ReturnType<typeof createGraphqlServer>,
): typeof fetch {
  return async (input, init) =>
    await server.fetch(new Request(input, init));
}

function createTestClient(timeoutMs = 30_000) {
  const serverErrors: Record<string, unknown>[] = [];
  const captureLog = (...args: unknown[]) => {
    const message = typeof args[0] === "string" ? args[0] : undefined;
    const event = typeof args[1] === "string" ? args[1] : undefined;
    const fields = (typeof args[0] === "object" ? args[0] : args[2] ?? args[1]) as Record<
      string,
      unknown
    >;

    serverErrors.push({
      ...fields,
      ...(message === undefined ? {} : { message }),
      ...(event === undefined ? {} : { event }),
    });
  };
  const logger = {
    info: captureLog,
    warn: captureLog,
    error: captureLog,
  } as Log;
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

it("executes a generated query document through the in-memory transport", async () => {
  const { client } = createTestClient();

  try {
    const queryResult = await client.query({
      query: graphqlTestQueryDocument,
      variables: { value: "typesafe" },
      fetchPolicy: "no-cache",
    });

    expect(queryResult.data?.testEcho).toBe("typesafe");
  } finally {
    await client.clearStore();
    client.stop();
  }
});

it("executes a generated mutation document through the in-memory transport", async () => {
  const { client } = createTestClient();

  try {
    const mutationResult = await client.mutate({
      mutation: graphqlTestMutationDocument,
      variables: { value: "monii" },
    });

    expect(mutationResult.data?.testReverse).toBe("iinom");
  } finally {
    await client.clearStore();
    client.stop();
  }
});

it("preserves public codes and masks unexpected errors", async () => {
  const { client, serverErrors } = createTestClient();
  const consoleError = vi
    .spyOn(globalThis.console, "error")
    .mockImplementation(() => {});

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
    expect(serverErrors).toMatchObject([
      { event: "graphql.unexpected_error" },
      { event: "graphql.unexpected_error" },
    ]);
    expect(JSON.stringify(serverErrors[0])).not.toContain("private test failure");
    expect(JSON.stringify(serverErrors[1])).not.toContain("private coded failure");
    expect(consoleError).not.toHaveBeenCalled();
  } finally {
    await client.clearStore();
    client.stop();
  }
});

it("aborts GraphQL execution at the client deadline", async () => {
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
