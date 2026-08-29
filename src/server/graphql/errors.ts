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

const publicGraphqlErrorCodes = new Set<string>(
  Object.values(graphqlErrorCodes),
);

export function isGraphqlErrorCode(value: unknown): value is GraphqlErrorCode {
  return typeof value === "string" && publicGraphqlErrorCodes.has(value);
}

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
