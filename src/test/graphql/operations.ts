import { graphql } from "../../generated/graphql/test/client";

export const graphqlTestQueryDocument = graphql(/* GraphQL */ `
  query GraphqlTestEcho($value: String!) {
    testEcho(value: $value)
  }
`);

export const graphqlTestMutationDocument = graphql(/* GraphQL */ `
  mutation GraphqlTestReverse($value: String!) {
    testReverse(value: $value)
  }
`);

export const graphqlTestFailureDocument = graphql(/* GraphQL */ `
  query GraphqlTestFailure($unexpected: Boolean!) {
    testFailure(unexpected: $unexpected)
  }
`);

export const graphqlTestUnknownErrorCodeDocument = graphql(/* GraphQL */ `
  query GraphqlTestUnknownErrorCode {
    testUnknownErrorCode
  }
`);

export const graphqlTestSlowDocument = graphql(/* GraphQL */ `
  query GraphqlTestSlow($delayMs: Int!) {
    testSlow(delayMs: $delayMs)
  }
`);
