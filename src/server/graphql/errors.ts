import { GraphQLError } from "graphql";

export const graphqlErrorCodes = {
  badUserInput: "BAD_USER_INPUT",
  conflict: "CONFLICT",
  forbidden: "FORBIDDEN",
  internalServerError: "INTERNAL_SERVER_ERROR",
  notFound: "NOT_FOUND",
  unauthenticated: "UNAUTHENTICATED",
} as const;

export type GraphqlErrorCode =
  (typeof graphqlErrorCodes)[keyof typeof graphqlErrorCodes];

type CreateGraphqlErrorOptions = {
  cause?: Error;
};

export function createGraphqlError(
  code: GraphqlErrorCode,
  message: string,
  options: CreateGraphqlErrorOptions = {},
) {
  return new GraphQLError(message, {
    originalError: options.cause,
    extensions: { code },
  });
}
