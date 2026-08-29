/* eslint-disable */
/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
export type GraphqlTestEchoQueryVariables = Exact<{
  value: string;
}>;


export type GraphqlTestEchoQuery = { testEcho: string };

export type GraphqlTestReverseMutationVariables = Exact<{
  value: string;
}>;


export type GraphqlTestReverseMutation = { testReverse: string };

export type GraphqlTestFailureQueryVariables = Exact<{
  unexpected: boolean;
}>;


export type GraphqlTestFailureQuery = { testFailure: string };

export type GraphqlTestUnknownErrorCodeQueryVariables = Exact<{ [key: string]: never; }>;


export type GraphqlTestUnknownErrorCodeQuery = { testUnknownErrorCode: string };

export type GraphqlTestSlowQueryVariables = Exact<{
  delayMs: number;
}>;


export type GraphqlTestSlowQuery = { testSlow: string };


export const GraphqlTestEchoDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GraphqlTestEcho"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"value"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"testEcho"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"value"},"value":{"kind":"Variable","name":{"kind":"Name","value":"value"}}}]}]}}]} as unknown as DocumentNode<GraphqlTestEchoQuery, GraphqlTestEchoQueryVariables>;
export const GraphqlTestReverseDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"GraphqlTestReverse"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"value"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"testReverse"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"value"},"value":{"kind":"Variable","name":{"kind":"Name","value":"value"}}}]}]}}]} as unknown as DocumentNode<GraphqlTestReverseMutation, GraphqlTestReverseMutationVariables>;
export const GraphqlTestFailureDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GraphqlTestFailure"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"unexpected"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Boolean"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"testFailure"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"unexpected"},"value":{"kind":"Variable","name":{"kind":"Name","value":"unexpected"}}}]}]}}]} as unknown as DocumentNode<GraphqlTestFailureQuery, GraphqlTestFailureQueryVariables>;
export const GraphqlTestUnknownErrorCodeDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GraphqlTestUnknownErrorCode"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"testUnknownErrorCode"}}]}}]} as unknown as DocumentNode<GraphqlTestUnknownErrorCodeQuery, GraphqlTestUnknownErrorCodeQueryVariables>;
export const GraphqlTestSlowDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GraphqlTestSlow"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"delayMs"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"testSlow"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"delayMs"},"value":{"kind":"Variable","name":{"kind":"Name","value":"delayMs"}}}]}]}}]} as unknown as DocumentNode<GraphqlTestSlowQuery, GraphqlTestSlowQueryVariables>;