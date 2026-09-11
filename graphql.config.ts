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
      schema: "apps/web/test-support/graphql-client/generated/schema.graphql",
      documents: [
        "apps/web/test-support/graphql-client/**/*.{ts,tsx}",
        "!apps/web/test-support/graphql-client/generated/**/*",
      ],
    },
  },
};

export default graphqlConfig;
