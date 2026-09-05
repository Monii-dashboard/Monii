import { getOperationContext } from "@monii/runtime/context";

import type { PowensConsoleConfig } from "../config";
import {
  createUser,
  type PowensCreatedUser,
} from "../endpoints/create-user";
import { createWebviewCode } from "../endpoints/create-webview-code";
import {
  renewUserAccessToken,
  type PowensRenewedUserAccessToken,
  type RenewUserAccessTokenInput,
} from "../endpoints/renew-user-access-token";
import {
  createPowensRequester,
  type PowensRequesterDependencies,
  type PowensRequestOptions,
} from "../transport";

export type PowensConsoleClient = Readonly<{
  createUser(options?: PowensRequestOptions): Promise<PowensCreatedUser>;
  createAddConnectionWebviewUrl(
    input: CreateAddConnectionWebviewUrlInput,
    options?: PowensRequestOptions,
  ): Promise<string>;
  renewUserAccessToken(
    input: RenewUserAccessTokenInput,
    options?: PowensRequestOptions,
  ): Promise<PowensRenewedUserAccessToken>;
}>;

export type PowensWebviewLanguage = "de" | "en" | "es" | "fr" | "it" | "nl" | "pt";

export type CreateAddConnectionWebviewUrlInput = Readonly<{
  language?: PowensWebviewLanguage;
  redirectUri: string;
  userAccessToken: string;
}>;

function parseRedirectUri(value: string): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error("Powens webview redirect URI must be an absolute URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Powens webview redirect URI must use HTTP or HTTPS");
  }

  return url.toString();
}

function createAddConnectionWebviewUrl(
  apiBaseUrl: string,
  clientId: string,
  redirectUri: string,
  code: string,
  language: PowensWebviewLanguage,
): string {
  const apiUrl = new URL(apiBaseUrl);
  const webviewUrl = new URL(`https://webview.powens.com/${language}/connect`);

  webviewUrl.searchParams.set("domain", apiUrl.hostname);
  webviewUrl.searchParams.set("client_id", clientId);
  webviewUrl.searchParams.set("redirect_uri", redirectUri);
  webviewUrl.searchParams.set("code", code);

  return webviewUrl.toString();
}

function assertConsoleSurface() {
  let surface: string;

  try {
    surface = getOperationContext().surface;
  } catch {
    throw new Error("Powens privileged operations require the console surface");
  }

  if (surface !== "console") {
    throw new Error("Powens privileged operations require the console surface");
  }
}

export function createPowensConsoleClient(
  config: PowensConsoleConfig,
  dependencies?: PowensRequesterDependencies,
): PowensConsoleClient {
  const request = createPowensRequester(config.apiBaseUrl, dependencies);
  const credentials = {
    clientId: config.clientId,
    clientSecret: config.clientSecret,
  };

  return {
    async createUser(options) {
      assertConsoleSurface();
      return await createUser(request, credentials, options);
    },
    async createAddConnectionWebviewUrl(input, options) {
      assertConsoleSurface();
      const redirectUri = parseRedirectUri(input.redirectUri);
      const { code } = await createWebviewCode(
        request,
        input.userAccessToken,
        options,
      );

      return createAddConnectionWebviewUrl(
        config.apiBaseUrl,
        config.clientId,
        redirectUri,
        code,
        input.language ?? "fr",
      );
    },
    async renewUserAccessToken(input, options) {
      assertConsoleSurface();
      return await renewUserAccessToken(request, credentials, input, options);
    },
  };
}
