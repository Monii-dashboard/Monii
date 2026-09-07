import { log } from "@monii/runtime/log";
import { runWithOperationContext } from "@monii/runtime/operation";
import { graphqlServer } from "@monii/graphql";

export const runtime = "nodejs";

function handleGraphqlRequest(request: Request) {
  return runWithOperationContext(
    { surface: "web" },
    () => {
      log({ event: "graphql.request.started" });
      return graphqlServer(request);
    },
  );
}

export {
  handleGraphqlRequest as GET,
  handleGraphqlRequest as OPTIONS,
  handleGraphqlRequest as POST,
};
