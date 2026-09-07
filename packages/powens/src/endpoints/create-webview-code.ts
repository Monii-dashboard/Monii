import { PowensTransportError } from "../errors";
import type { PowensRequest, PowensRequestOptions } from "../transport";

export type PowensWebviewCode = Readonly<{
  code: string;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function createWebviewCode(
  request: PowensRequest,
  userAccessToken: string,
  options?: PowensRequestOptions,
): Promise<PowensWebviewCode> {
  if (userAccessToken.trim() === "") {
    throw new Error("Powens user access token must not be empty");
  }

  const body = await request({
    authentication: { token: userAccessToken, type: "bearer" },
    method: "GET",
    options,
    path: "/auth/token/code?type=singleAccess",
  });

  if (!isRecord(body) || typeof body.code !== "string" || body.code === "") {
    throw new PowensTransportError(
      "Powens returned an invalid webview-code response",
      "invalid-response",
    );
  }

  return { code: body.code };
}
