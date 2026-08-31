import { PowensTransportError } from "../errors";
import type { PowensRequest, PowensRequestOptions } from "../transport";

export type PowensConnector = Readonly<{
  auth_mechanism?: string | null;
  capabilities?: readonly string[];
  hidden?: boolean | null;
  id: number;
  name: string;
  uuid: string;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isPowensConnector(value: unknown): value is PowensConnector {
  if (
    !isRecord(value) ||
    !Number.isInteger(value.id) ||
    typeof value.uuid !== "string" ||
    typeof value.name !== "string"
  ) {
    return false;
  }

  return (
    (value.hidden === undefined ||
      value.hidden === null ||
      typeof value.hidden === "boolean") &&
    (value.auth_mechanism === undefined ||
      value.auth_mechanism === null ||
      typeof value.auth_mechanism === "string") &&
    (value.capabilities === undefined ||
      (Array.isArray(value.capabilities) &&
        value.capabilities.every(
          (capability) => typeof capability === "string",
        )))
  );
}

export async function getConnector(
  request: PowensRequest,
  connectorUuid: string,
  options?: PowensRequestOptions,
): Promise<PowensConnector> {
  if (connectorUuid.trim() === "") {
    throw new Error("Powens connector UUID must not be empty");
  }

  const body = await request({
    authentication: { type: "none" },
    method: "GET",
    options,
    path: `/connectors/${encodeURIComponent(connectorUuid)}`,
  });

  if (!isPowensConnector(body)) {
    throw new PowensTransportError(
      "Powens returned an invalid connector response",
      "invalid-response",
    );
  }

  return body;
}
