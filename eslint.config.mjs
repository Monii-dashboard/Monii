import { fileURLToPath } from "node:url";
import { workspaceLintConfig } from "./tooling/workspace-policy.mjs";
import { defineConfig, globalIgnores } from "eslint/config";
import graphqlPlugin from "@graphql-eslint/eslint-plugin";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const frontendDocuments = [
  "apps/web/src/**/*.{ts,tsx}",
  "!apps/web/src/generated/**/*",
];
const testDocuments = [
  "tests/graphql/**/*.{ts,tsx}",
  "!tests/graphql/**/*.test.{ts,tsx}",
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
    settings: {
      next: {
        rootDir: "apps/web/",
      },
    },
  },
  {
    rules: {
      "no-console": "error",
    },
  },
  {
    files: ["packages/runtime/src/log.ts", "apps/console/src/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },
  {
    files: ["apps/console/src/preflight.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  ...workspaceLintConfig(fileURLToPath(new URL(".", import.meta.url))),
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    ignores: ["apps/web/src/generated/**/*"],
    processor: graphqlPlugin.processor,
  },
  {
    files: ["tests/graphql/**/*.{ts,tsx}"],
    ignores: ["tests/graphql/**/*.test.{ts,tsx}"],
    processor: graphqlPlugin.processor,
  },
  {
    files: ["apps/web/src/**/*.{ts,tsx}/*.graphql"],
    ignores: ["apps/web/src/generated/**/*"],
    ...graphqlOperationConfig(
      "apps/web/src/generated/graphql/app/schema.graphql",
      frontendDocuments,
    ),
  },
  {
    files: ["tests/graphql/**/*.{ts,tsx}/*.graphql"],
    ignores: ["tests/graphql/**/*.test.{ts,tsx}/*.graphql"],
    ...graphqlOperationConfig(
      "tests/generated/graphql/test/schema.graphql",
      testDocuments,
    ),
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    "**/.next/**",
    "**/out/**",
    "**/build/**",
    "**/next-env.d.ts",
    "apps/web/src/generated/**",
    "tests/generated/**",
    "specific_examples/**",
  ]),
]);

export default eslintConfig;
