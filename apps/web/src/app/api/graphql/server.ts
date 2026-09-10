import { createGraphqlServer, graphqlSchema } from "@monii/graphql";
import { createPostgresWealthQueryRepository } from "@monii/postgres/wealth";

export function createWebGraphqlServer() {
  let postgresWealthRepository:
    | ReturnType<typeof createPostgresWealthQueryRepository>
    | undefined;
  const wealthRepository = {
    loadCurrentWealthState() {
      postgresWealthRepository ??= createPostgresWealthQueryRepository();
      return postgresWealthRepository.loadCurrentWealthState();
    },
  };

  return createGraphqlServer({
    schema: graphqlSchema,
    wealthRepository,
  });
}
