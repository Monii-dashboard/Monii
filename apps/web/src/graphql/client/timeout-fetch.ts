import { GraphqlTimeoutError } from "./errors";

export const graphqlTimeoutMs = 30_000;

export function createTimeoutFetch(
  fetchImplementation: typeof fetch = fetch,
  timeoutMs = graphqlTimeoutMs,
): typeof fetch {
  return async (input, init = {}) => {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const callerSignal = init.signal;
    const signal = callerSignal
      ? AbortSignal.any([callerSignal, timeoutSignal])
      : timeoutSignal;

    try {
      return await fetchImplementation(input, { ...init, signal });
    } catch (error) {
      if (timeoutSignal.aborted && !callerSignal?.aborted) {
        throw new GraphqlTimeoutError(timeoutMs, { cause: error });
      }

      throw error;
    }
  };
}
