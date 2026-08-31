import { runWithOperationContext } from "@monii/runtime/operation";
import {
  createPowensClient,
  PowensApiError,
  PowensTransportError,
  readPowensConfig,
  type PowensConfig,
} from "@monii/server/powens";
import {
  createPowensConsoleClient,
  readPowensConsoleConfig,
  type PowensConsoleConfig,
} from "@monii/server/powens/console";
import { describe, expect, test, vi } from "vitest";

const config: PowensConfig = {
  apiBaseUrl: "https://monii-sandbox.biapi.pro/2.0",
  userAccessToken: "user-access-token",
};

const consoleConfig: PowensConsoleConfig = {
  apiBaseUrl: config.apiBaseUrl,
  clientId: "client-id",
  clientSecret: "client-secret",
};

function requestDetails(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>) {
  const [input, init] = fetchMock.mock.calls[0] ?? [];

  return {
    body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
    headers: new Headers(init?.headers),
    input,
    method: init?.method,
  };
}

describe("Powens configuration", () => {
  test("separates user-token configuration from project credentials", () => {
    const environment = {
      POWENS_API_BASE_URL: " https://monii-sandbox.biapi.pro/2.0/ ",
      POWENS_CLIENT_ID: consoleConfig.clientId,
      POWENS_CLIENT_SECRET: consoleConfig.clientSecret,
      POWENS_USER_ACCESS_TOKEN: config.userAccessToken,
    };

    expect(readPowensConfig(environment)).toEqual(config);
    expect(readPowensConsoleConfig(environment)).toEqual(consoleConfig);
  });

  test.each([
    ["normal", "POWENS_API_BASE_URL"],
    ["normal", "POWENS_USER_ACCESS_TOKEN"],
    ["console", "POWENS_API_BASE_URL"],
    ["console", "POWENS_CLIENT_ID"],
    ["console", "POWENS_CLIENT_SECRET"],
  ])("rejects missing %s configuration variable %s", (reader, name) => {
    const environment = {
      POWENS_API_BASE_URL: config.apiBaseUrl,
      POWENS_CLIENT_ID: consoleConfig.clientId,
      POWENS_CLIENT_SECRET: consoleConfig.clientSecret,
      POWENS_USER_ACCESS_TOKEN: config.userAccessToken,
      [name]: " ",
    };

    expect(() =>
      reader === "normal"
        ? readPowensConfig(environment)
        : readPowensConsoleConfig(environment),
    ).toThrow(`${name} is not configured`);
  });

  test.each([
    ["http://monii-sandbox.biapi.pro/2.0", "must use HTTPS"],
    ["https://monii-sandbox.biapi.pro", "must end with /2.0"],
    ["not a URL", "must be a valid URL"],
  ])("rejects invalid API base URL %s", (apiBaseUrl, message) => {
    expect(() =>
      readPowensConfig({
        POWENS_API_BASE_URL: apiBaseUrl,
        POWENS_USER_ACCESS_TOKEN: config.userAccessToken,
      }),
    ).toThrow(message);
  });
});

describe("Powens read endpoints", () => {
  test("gets the current user with only the user bearer token", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({ id: 42, signin: "2026-08-30T12:00:00Z" }),
    );

    await expect(
      createPowensClient(config, { fetch: fetchMock }).getCurrentUser(),
    ).resolves.toMatchObject({ id: 42 });

    const request = requestDetails(fetchMock);
    expect(request).toMatchObject({
      input: `${config.apiBaseUrl}/users/me`,
      method: "GET",
    });
    expect(request.headers.get("authorization")).toBe(
      `Bearer ${config.userAccessToken}`,
    );
    expect(JSON.stringify(request)).not.toContain(consoleConfig.clientId);
    expect(JSON.stringify(request)).not.toContain(consoleConfig.clientSecret);
  });

  test("lists connections with expanded connectors and unknown states", async () => {
    const response = {
      connections: [
        {
          connector: {
            auth_mechanism: "future-auth",
            id: 7,
            name: "Example Bank",
            uuid: "stable-connector-uuid",
          },
          id: 27,
          id_connector: 7,
          last_update: null,
          state: "FutureProviderState",
        },
      ],
    };
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json(response));

    await expect(
      createPowensClient(config, { fetch: fetchMock }).listConnections(),
    ).resolves.toEqual(response);
    expect(requestDetails(fetchMock)).toMatchObject({
      input: `${config.apiBaseUrl}/users/me/connections?expand=connector`,
      method: "GET",
    });
  });

  test("gets a connector by encoded stable UUID without authentication", async () => {
    const response = {
      capabilities: ["bank", "wealth", "future-product"],
      hidden: null,
      id: 7,
      name: "Example Bank",
      uuid: "stable uuid/one",
    };
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json(response));

    await expect(
      createPowensClient(config, { fetch: fetchMock }).getConnector(
        response.uuid,
      ),
    ).resolves.toEqual(response);

    const request = requestDetails(fetchMock);
    expect(request).toMatchObject({
      input: `${config.apiBaseUrl}/connectors/stable%20uuid%2Fone`,
      method: "GET",
    });
    expect(request.headers.has("authorization")).toBe(false);
  });

  test("lists partial account amounts and aggregate currency balances", async () => {
    const response = {
      accounts: [
        {
          balance: null,
          coming: null,
          currency: {
            crypto: false,
            id: "EUR",
            precision: 2,
            prefix: true,
            symbol: "€",
          },
          error: "FutureAccountError",
          id: 101,
          last_update: null,
          name: "Cash account",
          type: "future-account-type",
        },
        {
          balance: 1250.25,
          currency: { id: "EUR" },
          id: 102,
          last_update: "2026-08-30T12:00:00Z",
          name: "Investment account",
          valuation: null,
        },
      ],
      balances: { EUR: 1250.25, USD: null },
      coming_balances: { EUR: null },
    };
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json(response));

    await expect(
      createPowensClient(config, { fetch: fetchMock }).listAccounts(),
    ).resolves.toEqual(response);
    expect(requestDetails(fetchMock)).toMatchObject({
      input: `${config.apiBaseUrl}/users/me/accounts`,
      method: "GET",
    });
  });

  test.each([
    ["current user", "getCurrentUser", { id: "42", signin: "now" }],
    ["connections", "listConnections", { connections: [{ id: "27" }] }],
    ["connector", "getConnector", { id: 7, name: "Missing UUID" }],
    ["accounts", "listAccounts", { accounts: [{ id: 1 }] }],
  ])("rejects malformed required fields for %s", async (_name, method, body) => {
    const client = createPowensClient(config, {
      fetch: async () => Response.json(body),
    });
    const request =
      method === "getConnector"
        ? client.getConnector("uuid")
        : method === "listConnections"
          ? client.listConnections()
          : method === "listAccounts"
            ? client.listAccounts()
            : client.getCurrentUser();

    await expect(request).rejects.toMatchObject({ kind: "invalid-response" });
  });
});

describe("Powens console endpoints", () => {
  test("creates a permanent user with project credentials", async () => {
    const response = {
      auth_token: "new-user-token",
      expires_in: null,
      id_user: 88,
      type: "future-permanent-type",
    };
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json(response));
    const client = createPowensConsoleClient(consoleConfig, {
      fetch: fetchMock,
    });

    await expect(
      runWithOperationContext({ surface: "console" }, () => client.createUser()),
    ).resolves.toEqual(response);

    const request = requestDetails(fetchMock);
    expect(request).toMatchObject({
      body: {
        client_id: consoleConfig.clientId,
        client_secret: consoleConfig.clientSecret,
      },
      input: `${config.apiBaseUrl}/auth/init`,
      method: "POST",
    });
    expect(request.headers.has("authorization")).toBe(false);
    expect(request.headers.get("content-type")).toBe("application/json");
  });

  test.each([
    [undefined, false],
    [true, true],
  ])("renews a user token with revokePrevious %s", async (value, expected) => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({ access_token: "renewed-token", token_type: "Bearer" }),
    );
    const client = createPowensConsoleClient(consoleConfig, {
      fetch: fetchMock,
    });

    await runWithOperationContext({ surface: "console" }, () =>
      client.renewUserAccessToken({ revokePrevious: value, userId: 88 }),
    );

    expect(requestDetails(fetchMock)).toMatchObject({
      body: {
        client_id: consoleConfig.clientId,
        client_secret: consoleConfig.clientSecret,
        grant_type: "client_credentials",
        id_user: 88,
        revoke_previous: expected,
      },
      input: `${config.apiBaseUrl}/auth/renew`,
      method: "POST",
    });
  });

  test.each(["web", "cli"] as const)(
    "rejects privileged calls from the %s surface before fetching",
    async (surface) => {
      const fetchMock = vi.fn<typeof fetch>();
      const client = createPowensConsoleClient(consoleConfig, {
        fetch: fetchMock,
      });

      await expect(
        runWithOperationContext({ surface }, () => client.createUser()),
      ).rejects.toThrow("require the console surface");
      await expect(
        runWithOperationContext({ surface }, () =>
          client.renewUserAccessToken({ userId: 88 }),
        ),
      ).rejects.toThrow("require the console surface");
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  test("redacts project credentials from API errors", async () => {
    const client = createPowensConsoleClient(consoleConfig, {
      fetch: async () =>
        Response.json(
          {
            code: `invalid-${consoleConfig.clientId}`,
            description: `bad ${consoleConfig.clientSecret}`,
          },
          { status: 401 },
        ),
    });

    const error = await runWithOperationContext({ surface: "console" }, () =>
      client.createUser().catch((cause: unknown) => cause),
    );

    expect(error).toBeInstanceOf(PowensApiError);
    expect(JSON.stringify(error)).not.toContain(consoleConfig.clientId);
    expect(JSON.stringify(error)).not.toContain(consoleConfig.clientSecret);
  });
});

describe("Powens transport", () => {
  test("exposes structured API errors", async () => {
    const client = createPowensClient(config, {
      fetch: async () =>
        Response.json(
          {
            code: "invalidToken",
            description: "The supplied token is invalid",
            message: null,
            request_id: 123,
          },
          { status: 401 },
        ),
    });

    await expect(client.getCurrentUser()).rejects.toMatchObject({
      code: "invalidToken",
      description: "The supplied token is invalid",
      requestId: 123,
      status: 401,
    });
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
        throw new Error(config.userAccessToken);
      },
    });

    const error = await client.getCurrentUser().catch((cause) => cause);

    expect(error).toBeInstanceOf(PowensTransportError);
    expect(error).toMatchObject({ kind: "network" });
    expect(JSON.stringify(error)).not.toContain(config.userAccessToken);
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
