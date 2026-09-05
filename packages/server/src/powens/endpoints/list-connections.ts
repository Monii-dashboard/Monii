import { PowensTransportError } from "../errors";
import type { PowensRequest, PowensRequestOptions } from "../transport";
import { isPowensConnector, type PowensConnector } from "./get-connector";

export type PowensConnection = Readonly<{
  active?: boolean;
  connector: PowensConnector;
  error?: string | null;
  error_message?: string | null;
  id: number;
  id_connector: number;
  id_user?: number | null;
  last_update?: string | null;
  next_try?: string | null;
  state?: string | null;
}>;

export type PowensConnections = Readonly<{
  connections: readonly PowensConnection[];
  total?: number;
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
    (value.active === undefined || typeof value.active === "boolean") &&
    Number.isInteger(value.id) &&
    Number.isInteger(value.id_connector) &&
    isPowensConnector(value.connector) &&
    isOptionalNullableInteger(value.id_user) &&
    isOptionalNullableString(value.error) &&
    isOptionalNullableString(value.error_message) &&
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
  const connections: PowensConnection[] = [];
  let offset = 0;
  let total: number | null = null;

  do {
    const body = await request({
      authentication: { token: userAccessToken, type: "bearer" },
      method: "GET",
      options,
      path: `/users/me/connections?expand=connector&limit=1000&offset=${offset}`,
    });

    if (
      !isRecord(body) ||
      !Array.isArray(body.connections) ||
      !body.connections.every(isPowensConnection) ||
      (body.total !== undefined && !Number.isInteger(body.total))
    ) {
      throw new PowensTransportError(
        "Powens returned an invalid connections response",
        "invalid-response",
      );
    }
    connections.push(...body.connections);
    total = typeof body.total === "number" ? body.total : null;
    offset += body.connections.length;
    if (body.connections.length === 0) break;
  } while (total !== null && offset < total);

  if (total !== null && offset !== total) {
    throw new PowensTransportError(
      "Powens returned an incomplete connections response",
      "invalid-response",
    );
  }
  return { connections, ...(total === null ? {} : { total }) };
}
