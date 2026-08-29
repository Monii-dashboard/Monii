import { graphqlServer } from "@/server/graphql/server";

export const runtime = "nodejs";

export {
  graphqlServer as GET,
  graphqlServer as OPTIONS,
  graphqlServer as POST,
};
