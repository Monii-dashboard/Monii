import type { PowensConfig } from "./config";
import { getConnector, type PowensConnector } from "./endpoints/get-connector";
import {
  getCurrentUser,
  type PowensUser,
} from "./endpoints/get-current-user";
import {
  listAccounts,
  type PowensAccounts,
} from "./endpoints/list-accounts";
import {
  listConnections,
  type PowensConnections,
} from "./endpoints/list-connections";
import {
  createPowensRequester,
  type PowensRequesterDependencies,
  type PowensRequestOptions,
} from "./transport";

export type PowensClient = Readonly<{
  getConnector(
    connectorUuid: string,
    options?: PowensRequestOptions,
  ): Promise<PowensConnector>;
  getCurrentUser(options?: PowensRequestOptions): Promise<PowensUser>;
  listAccounts(
    input?: Readonly<{
      connectionId?: number;
      includeDisabled?: boolean;
    }>,
    options?: PowensRequestOptions,
  ): Promise<PowensAccounts>;
  listConnections(options?: PowensRequestOptions): Promise<PowensConnections>;
}>;

export function createPowensClient(
  config: PowensConfig,
  dependencies?: PowensRequesterDependencies,
): PowensClient {
  const request = createPowensRequester(config.apiBaseUrl, dependencies);

  return {
    getConnector: (connectorUuid, options) =>
      getConnector(request, connectorUuid, options),
    getCurrentUser: (options) =>
      getCurrentUser(request, config.userAccessToken, options),
    listAccounts: (input, options) =>
      listAccounts(request, config.userAccessToken, input, options),
    listConnections: (options) =>
      listConnections(request, config.userAccessToken, options),
  };
}
