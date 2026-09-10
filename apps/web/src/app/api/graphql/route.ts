import { log } from "@monii/runtime/log";
import { runWithOperationContext } from "@monii/runtime/operation";

import { createWebGraphqlServer } from "./server";

export const runtime = "nodejs";

const graphqlServer = createWebGraphqlServer();

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
