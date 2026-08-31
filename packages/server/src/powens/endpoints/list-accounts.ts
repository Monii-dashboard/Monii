import { PowensTransportError } from "../errors";
import type { PowensRequest, PowensRequestOptions } from "../transport";

export type PowensCurrency = Readonly<{
  crypto?: boolean;
  datetime?: string | null;
  id: string;
  marketcap?: number | null;
  name?: string;
  precision?: number;
  prefix?: boolean;
  symbol?: string | null;
}>;

export type PowensAccount = Readonly<{
  balance?: number | null;
  coming?: number | null;
  currency?: PowensCurrency | null;
  deleted?: string | null;
  disabled?: string | null;
  error?: string | null;
  id: number;
  id_connection?: number | null;
  id_source?: number | null;
  id_user?: number | null;
  last_update?: string | null;
  name: string;
  original_name?: string;
  type?: string | Readonly<Record<string, unknown>>;
  usage?: string | null;
  valuation?: number | null;
}>;

export type PowensAccounts = Readonly<{
  accounts: readonly PowensAccount[];
  balances?: Readonly<Record<string, number | null>>;
  coming_balances?: Readonly<Record<string, number | null>>;
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

function isOptionalNullableNumber(value: unknown) {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function isCurrency(value: unknown): value is PowensCurrency {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    (value.crypto === undefined || typeof value.crypto === "boolean") &&
    isOptionalNullableString(value.datetime) &&
    isOptionalNullableNumber(value.marketcap) &&
    (value.name === undefined || typeof value.name === "string") &&
    (value.precision === undefined || Number.isInteger(value.precision)) &&
    (value.prefix === undefined || typeof value.prefix === "boolean") &&
    isOptionalNullableString(value.symbol)
  );
}

function isCurrencyBalances(value: unknown) {
  return (
    value === undefined ||
    (isRecord(value) && Object.values(value).every(isOptionalNullableNumber))
  );
}

function isPowensAccount(value: unknown): value is PowensAccount {
  return (
    isRecord(value) &&
    Number.isInteger(value.id) &&
    typeof value.name === "string" &&
    isOptionalNullableInteger(value.id_connection) &&
    isOptionalNullableInteger(value.id_source) &&
    isOptionalNullableInteger(value.id_user) &&
    isOptionalNullableNumber(value.balance) &&
    isOptionalNullableNumber(value.coming) &&
    isOptionalNullableNumber(value.valuation) &&
    (value.currency === undefined ||
      value.currency === null ||
      isCurrency(value.currency)) &&
    (value.original_name === undefined ||
      typeof value.original_name === "string") &&
    (value.type === undefined ||
      typeof value.type === "string" ||
      isRecord(value.type)) &&
    isOptionalNullableString(value.usage) &&
    isOptionalNullableString(value.last_update) &&
    isOptionalNullableString(value.deleted) &&
    isOptionalNullableString(value.disabled) &&
    isOptionalNullableString(value.error)
  );
}

export async function listAccounts(
  request: PowensRequest,
  userAccessToken: string,
  options?: PowensRequestOptions,
): Promise<PowensAccounts> {
  const body = await request({
    authentication: { token: userAccessToken, type: "bearer" },
    method: "GET",
    options,
    path: "/users/me/accounts",
  });

  if (
    !isRecord(body) ||
    !Array.isArray(body.accounts) ||
    !body.accounts.every(isPowensAccount) ||
    !isCurrencyBalances(body.balances) ||
    !isCurrencyBalances(body.coming_balances)
  ) {
    throw new PowensTransportError(
      "Powens returned an invalid accounts response",
      "invalid-response",
    );
  }

  return body as PowensAccounts;
}
