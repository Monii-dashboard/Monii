import { GraphQLError, type GraphQLSchema } from "graphql";
import {
  createYoga,
  useExecutionCancellation as executionCancellationPlugin,
} from "graphql-yoga";
import { log, type Log } from "@monii/runtime/log";

import { graphqlErrorCodes, isGraphqlErrorCode } from "./errors";
import { graphqlSchema } from "./schema";
import type { WealthQueryRepository } from "@monii/wealth-query";

const graphqlEndpoint = "/api/graphql";

type CreateGraphqlServerOptions = {
  logger?: Log;
  now?: () => Date;
  schema: GraphQLSchema;
  wealthRepository?: WealthQueryRepository;
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
  logger = log,
  now = () => new Date(),
  schema,
  wealthRepository,
}: CreateGraphqlServerOptions) {
  return createYoga({
    schema,
    graphqlEndpoint,
    fetchAPI: { Response },
    cors: false,
    graphiql: process.env.NODE_ENV === "development",
    // Operational failures are emitted through Monii's structured logger in
    // maskError. Yoga's default logger would additionally print raw expected
    // and masked resolver errors, duplicating logs and exposing private detail.
    logging: false,
    // TODO: Add query-cost and rate controls before the public schema becomes
    // large enough for expensive nested requests to be a practical risk.
    plugins: [executionCancellationPlugin()],
    context: ({ request }) => {
      // TODO: Authenticate the single-user principal here (or verify identity
      // supplied by Specific's protected ingress) before financial resolvers
      // are exposed, then authorize resolver work through this context.
      return {
        now,
        request,
        signal: request.signal,
        wealthRepository,
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
          "Unexpected GraphQL execution failure",
          "graphql.unexpected_error",
          {
          error_kind: graphqlError.originalError.name,
          path: graphqlError.path,
          },
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
