"use client";

import { ApolloNextAppProvider } from "@apollo/client-integration-nextjs";
import type { PropsWithChildren } from "react";

import { createApolloGraphqlClient } from "./apollo-client";

export function GraphqlProvider({ children }: PropsWithChildren) {
  return (
    <ApolloNextAppProvider makeClient={createApolloGraphqlClient}>
      {children}
    </ApolloNextAppProvider>
  );
}
