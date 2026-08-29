import { defineConfig, globalIgnores } from "eslint/config";
import graphqlPlugin from "@graphql-eslint/eslint-plugin";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const frontendDocuments = [
  "src/**/*.{ts,tsx}",
  "!src/{db,server,test}/**/*",
  "!src/generated/**/*",
];
const testDocuments = [
  "src/test/graphql/**/*.{ts,tsx}",
  "!src/test/graphql/**/*.test.{ts,tsx}",
];

function graphqlOperationConfig(schema, documents) {
  return {
    languageOptions: {
      parser: graphqlPlugin.parser,
      parserOptions: {
        graphQLConfig: { schema, documents },
      },
    },
    plugins: {
      "@graphql-eslint": graphqlPlugin,
    },
    rules: graphqlPlugin.configs["flat/operations-recommended"].rules,
  };
}

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/{db,server,test}/**/*", "src/generated/**/*"],
    processor: graphqlPlugin.processor,
  },
  {
    files: ["src/test/graphql/**/*.{ts,tsx}"],
    ignores: ["src/test/graphql/**/*.test.{ts,tsx}"],
    processor: graphqlPlugin.processor,
  },
  {
    files: ["src/**/*.{ts,tsx}/*.graphql"],
    ignores: [
      "src/{db,server,test}/**/*.{ts,tsx}/*.graphql",
      "src/generated/**/*",
    ],
    ...graphqlOperationConfig(
      "src/generated/graphql/app/schema.graphql",
      frontendDocuments,
    ),
  },
  {
    files: ["src/test/graphql/**/*.{ts,tsx}/*.graphql"],
    ignores: ["src/test/graphql/**/*.test.{ts,tsx}/*.graphql"],
    ...graphqlOperationConfig(
      "src/generated/graphql/test/schema.graphql",
      testDocuments,
    ),
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/generated/**",
  ]),
]);

export default eslintConfig;
