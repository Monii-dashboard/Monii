import { GraphQLError, type GraphQLSchema } from "graphql";
import {
  createYoga,
  useExecutionCancellation as executionCancellationPlugin,
} from "graphql-yoga";

import { graphqlErrorCodes, isGraphqlErrorCode } from "./errors";
import { graphqlSchema } from "./schema";

const graphqlEndpoint = "/api/graphql";

type ErrorLogger = Pick<Console, "error">;

type CreateGraphqlServerOptions = {
  logger?: ErrorLogger;
  schema: GraphQLSchema;
};

function hasPublicErrorCode(error: GraphQLError) {
  return isGraphqlErrorCode(error.extensions.code);
}

function copyGraphqlError(
  error: GraphQLError,
  message: string,
  code: string,
  preserveExtensions = true,
) {
  return new GraphQLError(message, {
    nodes: error.nodes,
    source: error.source,
    positions: error.positions,
    path: error.path,
    originalError: preserveExtensions ? error.originalError : undefined,
    extensions: preserveExtensions ? { ...error.extensions, code } : { code },
  });
}

export function createGraphqlServer({
  logger = console,
  schema,
}: CreateGraphqlServerOptions) {
  return createYoga({
    schema,
    graphqlEndpoint,
    fetchAPI: { Response },
    cors: false,
    graphiql: process.env.NODE_ENV === "development",
    // TODO: Add query-cost and rate controls before the public schema becomes
    // large enough for expensive nested requests to be a practical risk.
    plugins: [executionCancellationPlugin()],
    context: ({ request }) => {
      // TODO: Authenticate the single-user principal here (or verify identity
      // supplied by Specific's protected ingress) before financial resolvers
      // are exposed, then authorize resolver work through this context.
      return {
        request,
        signal: request.signal,
      };
    },
    maskedErrors: {
      errorMessage: "Internal server error.",
      maskError(error) {
        const graphqlError =
          error instanceof GraphQLError
            ? error
            : new GraphQLError(
                error instanceof Error ? error.message : "Unexpected error.",
                {
                  originalError: error instanceof Error ? error : undefined,
                },
              );

        if (hasPublicErrorCode(graphqlError)) {
          return graphqlError;
        }

        if (!graphqlError.originalError) {
          return copyGraphqlError(
            graphqlError,
            graphqlError.message,
            "GRAPHQL_ERROR",
          );
        }

        logger.error(
          JSON.stringify({
            event: "graphql.unexpected_error",
            message: graphqlError.originalError.message,
            path: graphqlError.path,
          }),
        );

        return copyGraphqlError(
          graphqlError,
          "Internal server error.",
          graphqlErrorCodes.internalServerError,
          false,
        );
      },
    },
  });
}

export const graphqlServer = createGraphqlServer({ schema: graphqlSchema });
