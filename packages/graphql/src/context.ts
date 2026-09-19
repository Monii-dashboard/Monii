export type GraphqlContext = {
  now: () => Date;
  request: Request;
  signal: AbortSignal;
};
