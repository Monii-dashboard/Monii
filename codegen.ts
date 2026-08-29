import type { CodegenConfig } from "@graphql-codegen/cli";
import { printSchema } from "graphql";

import { graphqlSchema } from "./src/server/graphql/schema";
import { testGraphqlSchema } from "./src/test/graphql/schema";

const applicationSchema = printSchema(graphqlSchema);
const testSchema = printSchema(testGraphqlSchema);

const applicationDocuments = [
  "src/**/*.{ts,tsx}",
  "!src/{db,server,test}/**/*",
  "!src/generated/**/*",
];
const testDocuments = [
  "src/test/graphql/**/*.{ts,tsx}",
  "!src/test/graphql/**/*.test.{ts,tsx}",
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
    "src/generated/graphql/app/schema.graphql": {
      schema: applicationSchema,
      plugins: ["schema-ast"],
    },
    "src/generated/graphql/app/client/": {
      schema: applicationSchema,
      documents: applicationDocuments,
      preset: "client",
      plugins: [],
      config: {
        defaultScalarType: "unknown",
        strictScalars: true,
      },
    },
    "src/generated/graphql/test/schema.graphql": {
      schema: testSchema,
      plugins: ["schema-ast"],
    },
    "src/generated/graphql/test/client/": {
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
