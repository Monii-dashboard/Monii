import { ApolloLink, HttpLink } from "@apollo/client";
import { ErrorLink } from "@apollo/client/link/error";
import {
  ApolloClient,
  InMemoryCache,
} from "@apollo/client-integration-nextjs";

import { normalizeGraphqlError, type GraphqlClientFailure } from "./errors";
import { createTimeoutFetch, graphqlTimeoutMs } from "./timeout-fetch";

type GraphqlErrorReporter = (
  failure: GraphqlClientFailure & { operationName: string },
) => void;

type CreateApolloClientOptions = {
  fetchImplementation?: typeof fetch;
  reportError?: GraphqlErrorReporter;
  timeoutMs?: number;
  uri?: string;
};

function defaultGraphqlUri() {
  if (typeof window !== "undefined") {
    return "/api/graphql";
  }

  // TODO: Before server-rendered GraphQL operations are introduced, prefer
  // direct application-service calls or configure a deployment-aware origin;
  // a loopback HTTP request is not reliable in every hosting/build topology.
  return `http://127.0.0.1:${process.env.PORT ?? "3000"}/api/graphql`;
}

const defaultReportError: GraphqlErrorReporter = () => undefined;

export function createApolloGraphqlClient({
  fetchImplementation = fetch,
  reportError = defaultReportError,
  timeoutMs = graphqlTimeoutMs,
  uri = defaultGraphqlUri(),
}: CreateApolloClientOptions = {}) {
  const errorLink = new ErrorLink(({ error, operation }) => {
    reportError({
      ...normalizeGraphqlError(error),
      operationName: operation.operationName || "AnonymousOperation",
    });
  });
  const httpLink = new HttpLink({
    uri,
    fetch: createTimeoutFetch(fetchImplementation, timeoutMs),
  });

  return new ApolloClient({
    cache: new InMemoryCache(),
    link: ApolloLink.from([errorLink, httpLink]),
    defaultOptions: {
      query: { errorPolicy: "all" },
      watchQuery: { errorPolicy: "all" },
      mutate: { errorPolicy: "none" },
    },
  });
}
