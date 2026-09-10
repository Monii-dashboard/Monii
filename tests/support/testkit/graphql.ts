import type { TypedDocumentNode } from "@graphql-typed-document-node/core";
import { print } from "graphql";

import { getOrCreateIntegrationResource } from "./context";

type GraphqlServer = (request: Request) => Promise<Response> | Response;

type GraphqlError = Readonly<{
  extensions?: Readonly<Record<string, unknown>>;
  message: string;
  path?: readonly (number | string)[];
}>;

export type GraphqlExecutionResult<TData> = Readonly<{
  data?: TData;
  errors?: readonly GraphqlError[];
}>;

export function defineGraphqlEndpoint(input: Readonly<{
  createServer: () => GraphqlServer | Promise<GraphqlServer>;
  name: string;
}>) {
  return {
    async execute<TData, TVariables>(
      document: TypedDocumentNode<TData, TVariables>,
      variables: TVariables,
    ): Promise<GraphqlExecutionResult<TData>> {
      const server = await getOrCreateIntegrationResource(
        `graphql:${input.name}`,
        async () => ({ value: await input.createServer() }),
      );
      const response = await server(
        new Request(`http://${input.name}.integration.test/api/graphql`, {
          body: JSON.stringify({ query: print(document), variables }),
          headers: { "content-type": "application/json" },
          method: "POST",
        }),
      );
      return await response.json() as GraphqlExecutionResult<TData>;
    },
  };
}
