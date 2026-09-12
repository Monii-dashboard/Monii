import { getDatabase } from "@monii/postgres/client";
import { Institution } from "@monii/accounts/models";
import { beforeEach, expect, it } from "@testkit/integration";
import { getIntegrationDatabase } from "@testkit/postgres";

let databaseSeenByBeforeEach: ReturnType<typeof getIntegrationDatabase>;

beforeEach(() => {
  databaseSeenByBeforeEach = getIntegrationDatabase();
  expect(getDatabase()).toBe(databaseSeenByBeforeEach);
});

it("makes one active database available to hooks, tests, and models", async () => {
  expect(getIntegrationDatabase()).toBe(databaseSeenByBeforeEach);
  expect(getDatabase()).toBe(databaseSeenByBeforeEach);
  const institution = await Institution.create({ name: "Context bank" });
  await expect(Institution.find(institution.id)).resolves.toMatchObject({
    name: "Context bank",
  });
});
