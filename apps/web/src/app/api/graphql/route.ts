import { log } from "@monii/runtime/log";
import { runWithOperationContext } from "@monii/runtime/operation";
import { createGraphqlServer, graphqlSchema } from "@monii/graphql";
import { createPostgresWealthQueryRepository } from "@monii/postgres/wealth";

export const runtime = "nodejs";

let postgresWealthRepository:
  | ReturnType<typeof createPostgresWealthQueryRepository>
  | undefined;

const wealthRepository = {
  loadCurrentWealthState() {
    postgresWealthRepository ??= createPostgresWealthQueryRepository();
    return postgresWealthRepository.loadCurrentWealthState();
  },
};

const graphqlServer = createGraphqlServer({
  schema: graphqlSchema,
  wealthRepository,
});

function handleGraphqlRequest(request: Request) {
  return runWithOperationContext(
    { surface: "web" },
    () => {
      log.info("GraphQL request started", "graphql.request.started");
      return graphqlServer(request);
    },
  );
}

export {
  handleGraphqlRequest as GET,
  handleGraphqlRequest as OPTIONS,
  handleGraphqlRequest as POST,
};
