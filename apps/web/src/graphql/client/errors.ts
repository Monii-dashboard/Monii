import { CombinedGraphQLErrors } from "@apollo/client/errors";

export class GraphqlTimeoutError extends Error {
  readonly code = "TIMEOUT";
  readonly timeoutMs: number;

  constructor(timeoutMs: number, options?: ErrorOptions) {
    super(`GraphQL operation timed out after ${timeoutMs}ms.`, options);
    this.name = "GraphqlTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export type GraphqlClientFailure = {
  code: string;
  kind: "graphql" | "network" | "timeout";
  message: string;
};

export function normalizeGraphqlError(error: unknown): GraphqlClientFailure {
  if (error instanceof GraphqlTimeoutError) {
    return {
      code: error.code,
      kind: "timeout",
      message: error.message,
    };
  }

  if (CombinedGraphQLErrors.is(error)) {
    const firstError = error.errors[0];
    const code = firstError?.extensions?.code;

    return {
      code: typeof code === "string" ? code : "GRAPHQL_ERROR",
      kind: "graphql",
      message: firstError?.message ?? error.message,
    };
  }

  return {
    code: "NETWORK_ERROR",
    kind: "network",
    message: error instanceof Error ? error.message : "GraphQL request failed.",
  };
}
