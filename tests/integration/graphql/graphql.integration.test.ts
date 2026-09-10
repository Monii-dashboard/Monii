import { CombinedGraphQLErrors } from "@apollo/client/errors";
import { expect, test } from "vitest";

import {
  createGraphqlServer,
  graphqlSchema,
} from "@monii/graphql";
import type { Log } from "@monii/runtime/log";

import { createApolloGraphqlClient } from "../../../apps/web/src/graphql/client/apollo-client";
import { normalizeGraphqlError } from "../../../apps/web/src/graphql/client/errors";

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

test("excludes test-only fields from the production schema", async () => {
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

test("serializes the current-wealth projection returned by the repository", async () => {
  const recordedAt = new Date("2026-09-08T08:30:00.000Z");
  const server = createGraphqlServer({
    schema: graphqlSchema,
    now: () => recordedAt,
    wealthRepository: {
      loadCurrentWealthState: async () => ({
        lastSuccessfulSynchronizationAt: recordedAt,
        latestSynchronizationStatus: "succeeded",
        snapshot: {
          accounts: [
            {
              accountId: "account-1",
              accountName: "Everyday",
              adjustedAmount: "1250.5",
              category: "cash",
              contributedAmount: "1250.5",
              decision: "included",
              duplicateRole: "none",
              evaluatedAmount: "1250.5",
              evaluatedCurrency: "EUR",
              identityConflict: false,
              institutionId: "institution-1",
              institutionName: "Northbank",
              refreshUncertain: false,
              valuationEffectiveAt: recordedAt,
              valuationRecordedAt: recordedAt,
            },
          ],
          duplicateAdjustedEstimateAmount: "1250.5",
          headlineAmount: "1250.5",
          isComplete: true,
          likelyDuplicateGroupCount: 0,
          recordedAt,
          snapshotId: "snapshot-1",
        },
      }),
    },
  });
  const response = await server.fetch("http://graphql.test/api/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: `query CurrentWealth {
        currentWealth {
          headlineAmount
          currency
          health
          recordedAt
          institutions {
            name
            contributedAmount
            accounts { id name contributedAmount decision health }
          }
        }
      }`,
    }),
  });

  await expect(response.json()).resolves.toEqual({
    data: {
      currentWealth: {
        currency: "EUR",
        headlineAmount: "1250.5",
        health: "fresh",
        institutions: [
          {
            accounts: [
              {
                contributedAmount: "1250.5",
                decision: "included",
                health: "fresh",
                id: "account-1",
                name: "Everyday",
              },
            ],
            contributedAmount: "1250.5",
            name: "Northbank",
          },
        ],
        recordedAt: "2026-09-08T08:30:00.000Z",
      },
    },
  });
});

test("executes a generated query document through the in-memory transport", async () => {
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

test("executes a generated mutation document through the in-memory transport", async () => {
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
    expect(serverErrors).toMatchObject([
      { event: "graphql.unexpected_error" },
      { event: "graphql.unexpected_error" },
    ]);
    expect(JSON.stringify(serverErrors[0])).not.toContain("private test failure");
    expect(JSON.stringify(serverErrors[1])).not.toContain("private coded failure");
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
