import type { PowensConfig } from "./config";
import { PowensApiError, PowensTransportError } from "./errors";
import type { PowensUser } from "./types";

const DEFAULT_TIMEOUT_MS = 15_000;

type Fetch = typeof globalThis.fetch;

type PowensClientDependencies = Readonly<{
  fetch?: Fetch;
  timeoutMs?: number;
}>;

export type PowensRequestOptions = Readonly<{
  signal?: AbortSignal;
}>;

export type PowensClient = Readonly<{
  getCurrentUser(options?: PowensRequestOptions): Promise<PowensUser>;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function createApiError(status: number, body: unknown) {
  if (!isRecord(body)) {
    return new PowensApiError({ status });
  }

  return new PowensApiError({
    code: optionalString(body.code),
    description: optionalString(body.description),
    providerMessage: optionalString(body.message),
    requestId: optionalNumber(body.request_id),
    status,
  });
}

function parseCurrentUser(body: unknown): PowensUser {
  if (
    !isRecord(body) ||
    !Number.isInteger(body.id) ||
    typeof body.signin !== "string"
  ) {
    throw new PowensTransportError(
      "Powens returned an invalid current-user response",
      "invalid-response",
    );
  }

  return {
    id: body.id as number,
    signin: body.signin,
  };
}

function createRequestSignal(signal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  let timedOut = false;

  const abortFromCaller = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abortFromCaller, { once: true });

  if (signal?.aborted) {
    abortFromCaller();
  }

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  return {
    didTimeOut: () => timedOut,
    dispose: () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abortFromCaller);
    },
    signal: controller.signal,
  };
}

export function createPowensClient(
  config: PowensConfig,
  {
    fetch: fetchImplementation = globalThis.fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  }: PowensClientDependencies = {},
): PowensClient {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("Powens request timeout must be greater than zero");
  }

  async function request(path: string, options: PowensRequestOptions = {}) {
    const requestSignal = createRequestSignal(options.signal, timeoutMs);

    try {
      let response: Response;

      try {
        response = await fetchImplementation(`${config.apiBaseUrl}${path}`, {
          headers: {
            accept: "application/json",
            authorization: `Bearer ${config.userAccessToken}`,
          },
          signal: requestSignal.signal,
        });
      } catch (cause) {
        if (requestSignal.didTimeOut()) {
          throw new PowensTransportError(
            "Powens request timed out",
            "timeout",
            { cause },
          );
        }

        if (options.signal?.aborted) {
          throw new PowensTransportError(
            "Powens request was cancelled",
            "cancelled",
            { cause },
          );
        }

        throw new PowensTransportError("Powens request failed", "network", {
          cause,
        });
      }

      let body: unknown;

      try {
        body = await response.json();
      } catch (cause) {
        if (response.ok) {
          throw new PowensTransportError(
            "Powens returned a non-JSON response",
            "invalid-response",
            { cause },
          );
        }
      }

      if (!response.ok) {
        throw createApiError(response.status, body);
      }

      return body;
    } finally {
      requestSignal.dispose();
    }
  }

  return {
    async getCurrentUser(options) {
      return parseCurrentUser(await request("/users/me", options));
    },
  };
}
