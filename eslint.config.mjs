import { fileURLToPath } from "node:url";
import { workspaceLintConfig } from "./tooling/workspace-policy.mjs";
import { defineConfig, globalIgnores } from "eslint/config";
import graphqlPlugin from "@graphql-eslint/eslint-plugin";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const allGraphqlDocuments = [
  "apps/web/src/**/*.{ts,tsx}",
  "!apps/web/src/generated/**/*",
  "tests/integration/graphql/**/*.{ts,tsx}",
  "!tests/integration/graphql/**/*.test.{ts,tsx}",
  "!tests/integration/graphql/generated/**/*",
];

function graphqlOperationConfig() {
  return {
    languageOptions: {
      parser: graphqlPlugin.parser,
      parserOptions: {
        // graphql-eslint caches the first programmatic configuration. The test
        // schema is an intentional superset of the application schema; codegen
        // continues to validate application operations against the narrower
        // production schema.
        graphQLConfig: {
          schema: "tests/integration/graphql/generated/schema.graphql",
          documents: allGraphqlDocuments,
        },
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
    files: ["tests/integration/graphql/**/*.{ts,tsx}"],
    ignores: [
      "tests/integration/graphql/**/*.test.{ts,tsx}",
      "tests/integration/graphql/generated/**/*",
    ],
    processor: graphqlPlugin.processor,
  },
  {
    files: ["apps/web/src/**/*.{ts,tsx}/*.graphql"],
    ignores: ["apps/web/src/generated/**/*"],
    ...graphqlOperationConfig(),
  },
  {
    files: ["tests/integration/graphql/**/*.{ts,tsx}/*.graphql"],
    ignores: [
      "tests/integration/graphql/**/*.test.{ts,tsx}/*.graphql",
      "tests/integration/graphql/generated/**/*",
    ],
    ...graphqlOperationConfig(),
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    "**/.next/**",
    "**/storybook-static/**",
    "**/out/**",
    "**/build/**",
    "**/next-env.d.ts",
    "apps/web/src/generated/**",
    "tests/integration/graphql/generated/**",
    "specific_examples/**",
  ]),
]);

export default eslintConfig;
