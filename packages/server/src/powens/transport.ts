import { PowensApiError, PowensTransportError } from "./errors";

const DEFAULT_TIMEOUT_MS = 15_000;

type Fetch = typeof globalThis.fetch;

export type PowensRequestOptions = Readonly<{
  signal?: AbortSignal;
}>;

export type PowensAuthentication =
  | Readonly<{ type: "none" }>
  | Readonly<{ token: string; type: "bearer" }>;

export type PowensRequest = (request: Readonly<{
  authentication: PowensAuthentication;
  body?: Readonly<Record<string, unknown>>;
  method: "GET" | "POST";
  options?: PowensRequestOptions;
  path: string;
  sensitiveValues?: readonly string[];
}>) => Promise<unknown>;

export type PowensRequesterDependencies = Readonly<{
  fetch?: Fetch;
  timeoutMs?: number;
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

function sanitize(value: string | undefined, sensitiveValues: readonly string[]) {
  if (value === undefined) return undefined;

  return sensitiveValues.reduce(
    (sanitized, sensitiveValue) =>
      sensitiveValue === ""
        ? sanitized
        : sanitized.replaceAll(sensitiveValue, "[REDACTED]"),
    value,
  );
}

function createApiError(
  status: number,
  body: unknown,
  sensitiveValues: readonly string[],
) {
  if (!isRecord(body)) return new PowensApiError({ status });

  return new PowensApiError({
    code: sanitize(optionalString(body.code), sensitiveValues),
    description: sanitize(optionalString(body.description), sensitiveValues),
    providerMessage: sanitize(optionalString(body.message), sensitiveValues),
    requestId: optionalNumber(body.request_id),
    status,
  });
}

function createRequestSignal(signal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  let timedOut = false;

  const abortFromCaller = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abortFromCaller, { once: true });

  if (signal?.aborted) abortFromCaller();

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

export function createPowensRequester(
  apiBaseUrl: string,
  {
    fetch: fetchImplementation = globalThis.fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  }: PowensRequesterDependencies = {},
): PowensRequest {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("Powens request timeout must be greater than zero");
  }

  return async ({
    authentication,
    body: requestBody,
    method,
    options = {},
    path,
    sensitiveValues = [],
  }) => {
    const requestSignal = createRequestSignal(options.signal, timeoutMs);
    const requestSensitiveValues =
      authentication.type === "bearer"
        ? [...sensitiveValues, authentication.token]
        : sensitiveValues;

    try {
      const headers = new Headers({ accept: "application/json" });
      let body: string | undefined;

      if (authentication.type === "bearer") {
        headers.set("authorization", `Bearer ${authentication.token}`);
      }

      if (requestBody !== undefined) {
        headers.set("content-type", "application/json");
        body = JSON.stringify(requestBody);
      }

      let response: Response;

      try {
        response = await fetchImplementation(`${apiBaseUrl}${path}`, {
          body,
          headers,
          method,
          signal: requestSignal.signal,
        });
      } catch {
        if (requestSignal.didTimeOut()) {
          throw new PowensTransportError("Powens request timed out", "timeout");
        }

        if (options.signal?.aborted) {
          throw new PowensTransportError(
            "Powens request was cancelled",
            "cancelled",
          );
        }

        throw new PowensTransportError("Powens request failed", "network");
      }

      let responseBody: unknown;

      try {
        responseBody = await response.json();
      } catch {
        if (response.ok) {
          throw new PowensTransportError(
            "Powens returned a non-JSON response",
            "invalid-response",
          );
        }
      }

      if (!response.ok) {
        throw createApiError(
          response.status,
          responseBody,
          requestSensitiveValues,
        );
      }

      return responseBody;
    } finally {
      requestSignal.dispose();
    }
  };
}
