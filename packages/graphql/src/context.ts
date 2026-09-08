import type { WealthQueryRepository } from "@monii/wealth-query";

export type GraphqlContext = {
  now: () => Date;
  request: Request;
  signal: AbortSignal;
  wealthRepository?: WealthQueryRepository;
};
