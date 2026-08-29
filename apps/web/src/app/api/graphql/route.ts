import { graphqlServer } from "@monii/server/graphql";

export const runtime = "nodejs";

export {
  graphqlServer as GET,
  graphqlServer as OPTIONS,
  graphqlServer as POST,
};
