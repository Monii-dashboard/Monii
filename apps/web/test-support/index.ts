import { defineGraphqlEndpoint } from "@testkit/graphql";

import { createWebGraphqlServer } from "../src/app/api/graphql/server";

export const webGraphql = defineGraphqlEndpoint({
  createServer: createWebGraphqlServer,
  name: "web",
});
