import { getOperationContext } from "@monii/runtime/context";

import type { PowensConsoleConfig } from "../config";
import {
  createUser,
  type PowensCreatedUser,
} from "../endpoints/create-user";
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
  renewUserAccessToken(
    input: RenewUserAccessTokenInput,
    options?: PowensRequestOptions,
  ): Promise<PowensRenewedUserAccessToken>;
}>;

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
    async renewUserAccessToken(input, options) {
      assertConsoleSurface();
      return await renewUserAccessToken(request, credentials, input, options);
    },
  };
}
