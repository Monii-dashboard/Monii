import { describe, expect, test, vi } from "vitest";

import {
  createPowensClient,
  PowensApiError,
  PowensTransportError,
  readPowensConfig,
  type PowensConfig,
} from "@monii/server/powens";

const config: PowensConfig = {
  apiBaseUrl: "https://monii-sandbox.biapi.pro/2.0",
  clientId: "client-id",
  clientSecret: "client-secret",
  userAccessToken: "user-access-token",
};

describe("Powens configuration", () => {
  test("reads and normalizes the single-user configuration", () => {
    expect(
      readPowensConfig({
        POWENS_API_BASE_URL: " https://monii-sandbox.biapi.pro/2.0/ ",
        POWENS_CLIENT_ID: "client-id",
        POWENS_CLIENT_SECRET: "client-secret",
        POWENS_USER_ACCESS_TOKEN: "user-access-token",
      }),
    ).toEqual(config);
  });

  test.each([
    "POWENS_API_BASE_URL",
    "POWENS_CLIENT_ID",
    "POWENS_CLIENT_SECRET",
    "POWENS_USER_ACCESS_TOKEN",
  ])("rejects missing %s configuration", (name) => {
    const environment = {
      POWENS_API_BASE_URL: config.apiBaseUrl,
      POWENS_CLIENT_ID: config.clientId,
      POWENS_CLIENT_SECRET: config.clientSecret,
      POWENS_USER_ACCESS_TOKEN: config.userAccessToken,
      [name]: " ",
    };

    expect(() => readPowensConfig(environment)).toThrow(
      `${name} is not configured`,
    );
  });

  test.each([
    ["http://monii-sandbox.biapi.pro/2.0", "must use HTTPS"],
    ["https://monii-sandbox.biapi.pro", "must end with /2.0"],
    ["not a URL", "must be a valid URL"],
  ])("rejects invalid API base URL %s", (apiBaseUrl, message) => {
    expect(() =>
      readPowensConfig({
        POWENS_API_BASE_URL: apiBaseUrl,
        POWENS_CLIENT_ID: config.clientId,
        POWENS_CLIENT_SECRET: config.clientSecret,
        POWENS_USER_ACCESS_TOKEN: config.userAccessToken,
      }),
    ).toThrow(message);
  });
});

describe("Powens client", () => {
  test("gets the current user with only the user bearer token", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({ id: 42, signin: "2026-08-30T12:00:00Z" }),
    );
    const client = createPowensClient(config, { fetch: fetchMock });

    await expect(client.getCurrentUser()).resolves.toEqual({
      id: 42,
      signin: "2026-08-30T12:00:00Z",
    });

    const [input, init] = fetchMock.mock.calls[0] ?? [];
    expect(input).toBe("https://monii-sandbox.biapi.pro/2.0/users/me");
    expect(new Headers(init?.headers)).toEqual(
      new Headers({
        accept: "application/json",
        authorization: "Bearer user-access-token",
      }),
    );
    expect(JSON.stringify(init)).not.toContain(config.clientId);
    expect(JSON.stringify(init)).not.toContain(config.clientSecret);
  });

  test("exposes structured Powens API errors without credentials", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json(
        {
          code: "invalidToken",
          description: "The supplied token is invalid",
          message: null,
          request_id: 123,
        },
        { status: 401 },
      ),
    );
    const client = createPowensClient(config, { fetch: fetchMock });

    const error = await client.getCurrentUser().catch((cause) => cause);

    expect(error).toBeInstanceOf(PowensApiError);
    expect(error).toMatchObject({
      code: "invalidToken",
      description: "The supplied token is invalid",
      requestId: 123,
      status: 401,
    });
    expect(error.message).not.toContain(config.userAccessToken);
    expect(error.message).not.toContain(config.clientSecret);
  });

  test("falls back safely for a non-JSON API error", async () => {
    const client = createPowensClient(config, {
      fetch: async () => new Response("unavailable", { status: 503 }),
    });

    await expect(client.getCurrentUser()).rejects.toMatchObject({
      code: undefined,
      status: 503,
    });
  });

  test("rejects an invalid successful response", async () => {
    const client = createPowensClient(config, {
      fetch: async () => Response.json({ id: "42" }),
    });

    await expect(client.getCurrentUser()).rejects.toMatchObject({
      kind: "invalid-response",
    });
  });

  test("rejects a non-JSON successful response", async () => {
    const client = createPowensClient(config, {
      fetch: async () => new Response("not JSON"),
    });

    await expect(client.getCurrentUser()).rejects.toMatchObject({
      kind: "invalid-response",
    });
  });

  test("wraps network failures without leaking credentials", async () => {
    const client = createPowensClient(config, {
      fetch: async () => {
        throw new Error("connection refused");
      },
    });

    const error = await client.getCurrentUser().catch((cause) => cause);

    expect(error).toBeInstanceOf(PowensTransportError);
    expect(error).toMatchObject({ kind: "network" });
    expect(error.message).not.toContain(config.userAccessToken);
  });

  test("times out bounded requests", async () => {
    const client = createPowensClient(config, {
      fetch: async (_input, init) =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            { once: true },
          );
        }),
      timeoutMs: 1,
    });

    await expect(client.getCurrentUser()).rejects.toMatchObject({
      kind: "timeout",
    });
  });

  test("supports caller cancellation", async () => {
    const controller = new AbortController();
    const client = createPowensClient(config, {
      fetch: async (_input, init) =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            { once: true },
          );
        }),
    });

    const request = client.getCurrentUser({ signal: controller.signal });
    controller.abort();

    await expect(request).rejects.toMatchObject({ kind: "cancelled" });
  });
});
