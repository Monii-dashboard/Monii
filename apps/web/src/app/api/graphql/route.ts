import { log } from "@monii/runtime/log";
import { runWithOperationContext } from "@monii/runtime/operation";
import { graphqlServer } from "@monii/server/graphql";

export const runtime = "nodejs";

function handleGraphqlRequest(request: Request) {
  return runWithOperationContext(
    { surface: "web" },
    () => {
      log("graphql.request.started");
      return graphqlServer(request);
    },
  );
}

export {
  handleGraphqlRequest as GET,
  handleGraphqlRequest as OPTIONS,
  handleGraphqlRequest as POST,
};
