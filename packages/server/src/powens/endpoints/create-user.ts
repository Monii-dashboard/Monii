import { PowensTransportError } from "../errors";
import type { PowensRequest, PowensRequestOptions } from "../transport";

export type PowensCreatedUser = Readonly<{
  auth_token: string;
  expires_in?: number | null;
  id_user: number;
  type: string;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function createUser(
  request: PowensRequest,
  credentials: Readonly<{ clientId: string; clientSecret: string }>,
  options?: PowensRequestOptions,
): Promise<PowensCreatedUser> {
  const body = await request({
    authentication: { type: "none" },
    body: {
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
    },
    method: "POST",
    options,
    path: "/auth/init",
    sensitiveValues: [credentials.clientId, credentials.clientSecret],
  });

  if (
    !isRecord(body) ||
    typeof body.auth_token !== "string" ||
    !Number.isInteger(body.id_user) ||
    typeof body.type !== "string" ||
    (body.expires_in !== undefined &&
      body.expires_in !== null &&
      !Number.isInteger(body.expires_in))
  ) {
    throw new PowensTransportError(
      "Powens returned an invalid create-user response",
      "invalid-response",
    );
  }

  return body as PowensCreatedUser;
}
