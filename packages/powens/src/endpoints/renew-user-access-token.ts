import { PowensTransportError } from "../errors";
import type { PowensRequest, PowensRequestOptions } from "../transport";

export type RenewUserAccessTokenInput = Readonly<{
  revokePrevious?: boolean;
  userId: number;
}>;

export type PowensRenewedUserAccessToken = Readonly<{
  access_token: string;
  token_type: string;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function renewUserAccessToken(
  request: PowensRequest,
  credentials: Readonly<{ clientId: string; clientSecret: string }>,
  { revokePrevious = false, userId }: RenewUserAccessTokenInput,
  options?: PowensRequestOptions,
): Promise<PowensRenewedUserAccessToken> {
  if (!Number.isInteger(userId)) {
    throw new Error("Powens user ID must be an integer");
  }

  const body = await request({
    authentication: { type: "none" },
    body: {
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      grant_type: "client_credentials",
      id_user: userId,
      revoke_previous: revokePrevious,
    },
    method: "POST",
    options,
    path: "/auth/renew",
    sensitiveValues: [credentials.clientId, credentials.clientSecret],
  });

  if (
    !isRecord(body) ||
    typeof body.access_token !== "string" ||
    typeof body.token_type !== "string"
  ) {
    throw new PowensTransportError(
      "Powens returned an invalid renew-token response",
      "invalid-response",
    );
  }

  return body as PowensRenewedUserAccessToken;
}
