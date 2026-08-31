import { PowensTransportError } from "../errors";
import type { PowensRequest, PowensRequestOptions } from "../transport";
import { isPowensConnector, type PowensConnector } from "./get-connector";

export type PowensConnection = Readonly<{
  connector: PowensConnector;
  id: number;
  id_connector: number;
  id_user?: number | null;
  last_update?: string | null;
  next_try?: string | null;
  state?: string | null;
}>;

export type PowensConnections = Readonly<{
  connections: readonly PowensConnection[];
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionalNullableString(value: unknown) {
  return value === undefined || value === null || typeof value === "string";
}

function isOptionalNullableInteger(value: unknown) {
  return value === undefined || value === null || Number.isInteger(value);
}

function isPowensConnection(value: unknown): value is PowensConnection {
  return (
    isRecord(value) &&
    Number.isInteger(value.id) &&
    Number.isInteger(value.id_connector) &&
    isPowensConnector(value.connector) &&
    isOptionalNullableInteger(value.id_user) &&
    isOptionalNullableString(value.last_update) &&
    isOptionalNullableString(value.next_try) &&
    isOptionalNullableString(value.state)
  );
}

export async function listConnections(
  request: PowensRequest,
  userAccessToken: string,
  options?: PowensRequestOptions,
): Promise<PowensConnections> {
  const body = await request({
    authentication: { token: userAccessToken, type: "bearer" },
    method: "GET",
    options,
    path: "/users/me/connections?expand=connector",
  });

  if (
    !isRecord(body) ||
    !Array.isArray(body.connections) ||
    !body.connections.every(isPowensConnection)
  ) {
    throw new PowensTransportError(
      "Powens returned an invalid connections response",
      "invalid-response",
    );
  }

  return body as PowensConnections;
}
