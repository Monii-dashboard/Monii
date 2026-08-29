const frontendDocuments = [
  "src/**/*.{ts,tsx}",
  "!src/{db,server,test}/**/*",
  "!src/generated/**/*",
];

const graphqlConfig = {
  projects: {
    app: {
      schema: "src/generated/graphql/app/schema.graphql",
      documents: frontendDocuments,
    },
    test: {
      schema: "src/generated/graphql/test/schema.graphql",
      documents: [
        "src/test/graphql/**/*.{ts,tsx}",
        "!src/test/graphql/**/*.test.{ts,tsx}",
      ],
    },
  },
};

export default graphqlConfig;
