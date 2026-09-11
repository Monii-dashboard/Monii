import { getDatabase } from "@monii/postgres/client";
import { createPostgresWealthQueryRepository } from "@monii/postgres/wealth";
import { beforeEach, expect, it } from "@testkit/integration";
import { getIntegrationDatabase } from "@testkit/postgres";

let databaseSeenByBeforeEach: ReturnType<typeof getIntegrationDatabase>;

beforeEach(() => {
  databaseSeenByBeforeEach = getIntegrationDatabase();
  expect(getDatabase()).toBe(databaseSeenByBeforeEach);
});

it("makes one active database available to hooks, tests, and default repositories", async () => {
  expect(getIntegrationDatabase()).toBe(databaseSeenByBeforeEach);
  expect(getDatabase()).toBe(databaseSeenByBeforeEach);
  await expect(
    createPostgresWealthQueryRepository().loadCurrentWealthState(),
  ).resolves.toEqual({
    lastSuccessfulSynchronizationAt: null,
    latestSynchronizationStatus: null,
    snapshot: null,
  });
});
