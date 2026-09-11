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

it("serializes the current-wealth projection returned by the repository", async () => {
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
