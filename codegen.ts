import type { CodegenConfig } from "@graphql-codegen/cli";
import { printSchema } from "graphql";

import { graphqlSchema } from "@monii/graphql";

import { testGraphqlSchema } from "./tests/integration/graphql/schema";

const applicationSchema = printSchema(graphqlSchema);
const testSchema = printSchema(testGraphqlSchema);

const applicationDocuments = [
  "apps/web/src/**/*.{ts,tsx}",
  "!apps/web/src/generated/**/*",
];
const testDocuments = [
  "tests/integration/graphql/**/*.{ts,tsx}",
  "!tests/integration/graphql/**/*.test.{ts,tsx}",
  "!tests/integration/graphql/generated/**/*",
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
    "tests/integration/graphql/generated/schema.graphql": {
      schema: testSchema,
      plugins: ["schema-ast"],
    },
    "tests/integration/graphql/generated/client/": {
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
