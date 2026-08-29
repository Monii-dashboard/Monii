import "reflect-metadata";

import type { GraphQLSchema } from "graphql";
import { buildSchemaSync, type ClassType } from "type-graphql";

import { HealthResolver } from "./resolvers/health";

type CreateGraphqlSchemaOptions = {
  resolvers?: readonly ClassType[];
};

export function createGraphqlSchema({
  resolvers = [],
}: CreateGraphqlSchemaOptions = {}): GraphQLSchema {
  const schemaResolvers: [typeof HealthResolver, ...ClassType[]] = [
    HealthResolver,
    ...resolvers,
  ];

  return buildSchemaSync({
    resolvers: schemaResolvers,
    validate: false,
  });
}

export const graphqlSchema = createGraphqlSchema();
