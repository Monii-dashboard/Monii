import type { CodegenConfig } from "@graphql-codegen/cli";
import { printSchema } from "graphql";

import { graphqlSchema } from "@monii/server/graphql";

import { testGraphqlSchema } from "./tests/graphql/schema";

const applicationSchema = printSchema(graphqlSchema);
const testSchema = printSchema(testGraphqlSchema);

const applicationDocuments = [
  "apps/web/src/**/*.{ts,tsx}",
  "!apps/web/src/generated/**/*",
];
const testDocuments = [
  "tests/graphql/**/*.{ts,tsx}",
  "!tests/graphql/**/*.test.{ts,tsx}",
];

const config: CodegenConfig = {
  overwrite: true,
  // TODO: Remove or scope this to the test project once the application has
  // operations, so a broken application document glob fails generation.
  ignoreNoDocuments: true,
  pluckConfig: {
    globalGqlIdentifierName: ["graphql"],
  },
  generates: {
    "apps/web/src/generated/graphql/app/schema.graphql": {
      schema: applicationSchema,
      plugins: ["schema-ast"],
    },
    "apps/web/src/generated/graphql/app/client/": {
      schema: applicationSchema,
      documents: applicationDocuments,
      preset: "client",
      plugins: [],
      config: {
        defaultScalarType: "unknown",
        strictScalars: true,
      },
    },
    "tests/generated/graphql/test/schema.graphql": {
      schema: testSchema,
      plugins: ["schema-ast"],
    },
    "tests/generated/graphql/test/client/": {
      schema: testSchema,
      documents: testDocuments,
      preset: "client",
      plugins: [],
      config: {
        defaultScalarType: "unknown",
        strictScalars: true,
      },
    },
  },
};

export default config;
