import "reflect-metadata";

import type { GraphQLSchema } from "graphql";
import { buildSchemaSync, type ClassType } from "type-graphql";

import { HealthResolver } from "./resolvers/health";
import { CurrentWealthResolver } from "./resolvers/current-wealth";

type CreateGraphqlSchemaOptions = {
  resolvers?: readonly ClassType[];
};

export function createGraphqlSchema({
  resolvers = [],
}: CreateGraphqlSchemaOptions = {}): GraphQLSchema {
  const schemaResolvers: [
    typeof HealthResolver,
    typeof CurrentWealthResolver,
    ...ClassType[],
  ] = [
    HealthResolver,
    CurrentWealthResolver,
    ...resolvers,
  ];

  return buildSchemaSync({
    resolvers: schemaResolvers,
    // TODO: Choose explicit transport-input validation before relying on
    // validation decorators in future GraphQL input classes.
    validate: false,
  });
}

export const graphqlSchema = createGraphqlSchema();
