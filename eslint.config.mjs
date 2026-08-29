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

const serverImportRestriction = {
  group: ["@monii/server", "@monii/server/*"],
  message: "Import server adapters only from a server-side composition root.",
};

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
    files: ["packages/application/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            serverImportRestriction,
            {
              group: [
                "next",
                "next/*",
                "node:*",
                "graphql",
                "graphql/*",
                "type-graphql",
                "drizzle-orm",
                "drizzle-orm/*",
                "postgres",
              ],
              message:
                "Keep the application package independent of frameworks and adapters.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[object.name='process'][property.name='env']",
          message:
            "Pass configured dependencies or values into application code instead of reading process.env.",
        },
      ],
    },
  },
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    ignores: ["apps/web/src/app/api/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [serverImportRestriction],
        },
      ],
    },
  },
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
