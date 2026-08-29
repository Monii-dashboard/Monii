import { useLazyQuery, useQuery } from "@apollo/client/react";

import { graphqlTestQueryDocument } from "./operations";

export function useGraphqlTestQueryContracts(value: string) {
  const eagerQuery = useQuery(graphqlTestQueryDocument, {
    variables: { value },
  });
  const lazyQuery = useLazyQuery(graphqlTestQueryDocument);
  const loadLazyQuery = () => lazyQuery[0]({ variables: { value } });

  return { eagerQuery, lazyQuery, loadLazyQuery };
}
