import { PowensTransportError } from "../errors";
import type { PowensRequest, PowensRequestOptions } from "../transport";

export type PowensUser = Readonly<{
  id: number;
  signin: string;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function getCurrentUser(
  request: PowensRequest,
  userAccessToken: string,
  options?: PowensRequestOptions,
): Promise<PowensUser> {
  const body = await request({
    authentication: { token: userAccessToken, type: "bearer" },
    method: "GET",
    options,
    path: "/users/me",
  });

  if (
    !isRecord(body) ||
    !Number.isInteger(body.id) ||
    typeof body.signin !== "string"
  ) {
    throw new PowensTransportError(
      "Powens returned an invalid current-user response",
      "invalid-response",
    );
  }

  return body as PowensUser;
}
