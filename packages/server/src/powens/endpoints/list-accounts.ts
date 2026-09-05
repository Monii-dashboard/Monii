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

export type PowensAccountType = Readonly<{
  id: number;
  is_invest: boolean;
  name: string;
}>;

export type PowensAccount = Readonly<{
  balance?: number | null;
  coming?: number | null;
  currency?: PowensCurrency | null;
  deleted?: string | null;
  disabled?: string | null;
  error?: string | null;
  iban?: string | null;
  id: number;
  id_connection?: number | null;
  id_source?: number | null;
  id_user?: number | null;
  last_update?: string | null;
  name: string;
  number?: string | null;
  original_name?: string;
  type?: string | PowensAccountType;
  usage?: string | null;
  valuation?: number | null;
}>;

export type PowensAccounts = Readonly<{
  accounts: readonly PowensAccount[];
  balances?: Readonly<Record<string, number | null>>;
  coming_balances?: Readonly<Record<string, number | null>>;
  isComplete: boolean;
  rejectedAccounts: readonly Readonly<{
    externalId: string | null;
    reason: "malformed";
  }>[];
  reportedTotal: number | null;
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

function isAccountType(value: unknown): value is PowensAccountType {
  return (
    isRecord(value) &&
    Number.isInteger(value.id) &&
    typeof value.is_invest === "boolean" &&
    typeof value.name === "string"
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
    (value.currency === undefined || value.currency === null || isCurrency(value.currency)) &&
    (value.original_name === undefined || typeof value.original_name === "string") &&
    (value.type === undefined || typeof value.type === "string" || isAccountType(value.type)) &&
    isOptionalNullableString(value.usage) &&
    isOptionalNullableString(value.last_update) &&
    isOptionalNullableString(value.deleted) &&
    isOptionalNullableString(value.disabled) &&
    isOptionalNullableString(value.error) &&
    isOptionalNullableString(value.iban) &&
    isOptionalNullableString(value.number)
  );
}

export async function listAccounts(
  request: PowensRequest,
  userAccessToken: string,
  input: Readonly<{
    connectionId?: number;
    includeDisabled?: boolean;
  }> = {},
  options?: PowensRequestOptions,
): Promise<PowensAccounts> {
  if (input.connectionId !== undefined && !Number.isInteger(input.connectionId)) {
    throw new Error("Powens connection ID must be an integer");
  }

  const basePath =
    input.connectionId === undefined
      ? "/users/me/accounts"
      : `/users/me/connections/${input.connectionId}/accounts`;
  const accounts: PowensAccount[] = [];
  const rejectedAccounts: {
    externalId: string | null;
    reason: "malformed";
  }[] = [];
  let offset = 0;
  let reportedTotal: number | null = null;
  let isComplete = true;
  let balances: Readonly<Record<string, number | null>> | undefined;
  let comingBalances: Readonly<Record<string, number | null>> | undefined;

  do {
    const query = `${input.includeDisabled ? "all&" : ""}limit=1000&offset=${offset}`;
    let body: unknown;
    try {
      body = await request({
        authentication: { token: userAccessToken, type: "bearer" },
        method: "GET",
        options,
        path: `${basePath}?${query}`,
      });
    } catch (error) {
      if (offset === 0) throw error;
      isComplete = false;
      break;
    }

    if (
      !isRecord(body) ||
      !Array.isArray(body.accounts) ||
      !isCurrencyBalances(body.balances) ||
      !isCurrencyBalances(body.coming_balances) ||
      (body.total !== undefined && !Number.isInteger(body.total))
    ) {
      if (offset === 0) {
        throw new PowensTransportError(
          "Powens returned an invalid accounts response",
          "invalid-response",
        );
      }
      isComplete = false;
      break;
    }

    reportedTotal = typeof body.total === "number" ? body.total : reportedTotal;
    balances = body.balances as typeof balances;
    comingBalances = body.coming_balances as typeof comingBalances;
    for (const item of body.accounts) {
      if (isPowensAccount(item)) accounts.push(item);
      else {
        rejectedAccounts.push({
          externalId:
            isRecord(item) && Number.isInteger(item.id) ? String(item.id) : null,
          reason: "malformed",
        });
      }
    }
    offset += body.accounts.length;
    if (body.accounts.length === 0) break;
  } while (reportedTotal !== null && offset < reportedTotal);

  if (reportedTotal !== null && offset !== reportedTotal) isComplete = false;
  return {
    accounts,
    ...(balances === undefined ? {} : { balances }),
    ...(comingBalances === undefined ? {} : { coming_balances: comingBalances }),
    isComplete,
    rejectedAccounts,
    reportedTotal,
  };
}
