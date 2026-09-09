// Keep these document globs aligned with codegen.ts and eslint.config.mjs.
// Extract shared config if the patterns begin changing independently.
const frontendDocuments = [
  "apps/web/src/**/*.{ts,tsx}",
  "!apps/web/src/generated/**/*",
];

const graphqlConfig = {
  projects: {
    app: {
      schema: "apps/web/src/generated/graphql/app/schema.graphql",
      documents: frontendDocuments,
    },
    test: {
      schema: "tests/integration/graphql/generated/schema.graphql",
      documents: [
        "tests/integration/graphql/**/*.{ts,tsx}",
        "!tests/integration/graphql/**/*.test.{ts,tsx}",
        "!tests/integration/graphql/generated/**/*",
      ],
    },
  },
};

export default graphqlConfig;
