import { createGraphqlServer, graphqlSchema } from "@monii/graphql";

export function createWebGraphqlServer() {
  return createGraphqlServer({ schema: graphqlSchema });
}
