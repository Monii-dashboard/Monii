import { createHmac } from "node:crypto";

import type {
  AccountKind,
  AccountUsage,
  FinancialSource,
  NormalizedAccount,
  NormalizedConnection,
  SourceLifecycle,
} from "@monii/application";
import { log } from "@monii/runtime/log";

import type { PowensClient } from "./client";
import type { PowensConfig } from "./config";
import type { PowensAccount } from "./endpoints/list-accounts";

const CASH_TYPES = new Set([
  "cat", "cel", "checking", "csl", "deposit", "joint", "ldds",
  "livret_a", "livret_b", "pel", "savings",
]);
const INVESTMENT_TYPES = new Set([
  "article83", "capitalisation", "crowdlending", "lifeinsurance", "madelin",
  "market", "pea", "pee", "per", "perco", "perp", "real_estate", "rsp",
]);
const UNSUPPORTED_TYPES = new Set(["card", "loan"]);
const LOCAL_DATE =
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/;

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function providerDate(
  value: string | null | undefined,
  timeZone: string,
  retrievedAt: Date,
): Readonly<{ date: Date | null; rejected: "ambiguous_or_invalid" | "future" | null }> {
  if (!value) return { date: null, rejected: null };
  let date: Date | null = null;

  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(value)) {
    const parsed = new Date(value);
    date = Number.isNaN(parsed.getTime()) ? null : parsed;
  } else {
    const match = LOCAL_DATE.exec(value);
    if (match) {
      const [, year, month, day, hour, minute, second, millisecond = "0"] = match;
      const nominal = Date.UTC(
        Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute),
        Number(second), Number(millisecond.padEnd(3, "0")),
      );
      const candidates: Date[] = [];
      // Modern IANA offsets are quarter-hour aligned. Multiple matches identify
      // the repeated hour at a DST transition, which is intentionally rejected.
      for (let offsetMinutes = -14 * 60; offsetMinutes <= 14 * 60; offsetMinutes += 15) {
        const candidate = new Date(nominal + offsetMinutes * 60_000);
        const parts = zonedParts(candidate, timeZone);
        if (
          parts.year === year && parts.month === month && parts.day === day &&
          parts.hour === hour && parts.minute === minute && parts.second === second
        ) {
          candidates.push(candidate);
        }
      }
      date = candidates.length === 1 ? candidates[0]! : null;
    }
  }

  if (!date) return { date: null, rejected: "ambiguous_or_invalid" };
  if (date.getTime() > retrievedAt.getTime() + 5 * 60_000) {
    return { date: null, rejected: "future" };
  }
  return { date, rejected: null };
}

function sourceType(account: PowensAccount): string | null {
  return typeof account.type === "string"
    ? account.type
    : account.type?.name ?? null;
}

function accountKind(account: PowensAccount): AccountKind {
  const type = sourceType(account);
  if (!type || type === "unknown") return "unknown";
  if (UNSUPPORTED_TYPES.has(type)) return "unsupported";
  if (typeof account.type === "object" && account.type.is_invest) return "investment";
  if (INVESTMENT_TYPES.has(type)) return "investment";
  return CASH_TYPES.has(type) ? "cash" : "unknown";
}

function accountUsage(account: PowensAccount): AccountUsage {
  if (account.usage === "PRIV") return "private";
  if (account.usage === "ORGA") return "professional";
  return "unknown";
}

function lifecycle(account: PowensAccount): SourceLifecycle {
  if (account.deleted) return "deleted";
  if (account.disabled) return "disabled";
  return "active";
}

function currency(account: PowensAccount): string | null {
  const code = account.currency?.id.toUpperCase();
  return code && /^[A-Z]{3}$/.test(code) ? code : null;
}

function decimalAmount(value: number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value);
  if (/^-?\d+(?:\.\d{1,8})?$/.test(text)) return text;
  return value.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
}

function validIban(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.normalize("NFKC").replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(normalized)) return null;
  const rearranged = `${normalized.slice(4)}${normalized.slice(0, 4)}`;
  let remainder = 0;
  for (const character of rearranged) {
    const digits = /\d/.test(character)
      ? character
      : String(character.charCodeAt(0) - 55);
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1 ? normalized : null;
}

function normalizedNumber(value: string | null | undefined) {
  const normalized = value?.normalize("NFKC").trim().toUpperCase();
  return normalized ? normalized.replace(/\s+/g, " ") : null;
}

function normalizedName(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("und").replace(/\s+/g, " ");
}

function fingerprint(key: string, type: string, value: string | null) {
  return value
    ? createHmac("sha256", key).update(`${type}\0${value}`).digest("hex")
    : null;
}

function normalizeAccount(
  account: PowensAccount,
  config: Pick<PowensConfig, "fingerprintKey" | "fingerprintKeyVersion" | "sourceTimeZone">,
): NormalizedAccount {
  const retrievedAt = new Date();
  const timestamp = providerDate(account.last_update, config.sourceTimeZone, retrievedAt);
  if (timestamp.rejected) {
    log.warning("Provider timestamp rejected", "sync.timestamp_rejected", {
      provider: "powens",
      provider_account_id: String(account.id),
      reason: timestamp.rejected,
    });
  }
  const originalName = account.original_name ?? account.name;
  return {
    balance: decimalAmount(account.balance),
    currency: currency(account),
    estimatedValue: decimalAmount(account.valuation),
    externalId: String(account.id),
    identity: {
      accountNumberFingerprint: fingerprint(
        config.fingerprintKey,
        "account_number",
        normalizedNumber(account.number),
      ),
      ibanFingerprint: fingerprint(
        config.fingerprintKey,
        "iban",
        validIban(account.iban),
      ),
      keyVersion: config.fingerprintKeyVersion,
      sourceNameFingerprint: fingerprint(
        config.fingerprintKey,
        "source_name",
        normalizedName(originalName),
      )!,
    },
    kind: accountKind(account),
    lifecycle: lifecycle(account),
    name: account.name,
    sourceType: sourceType(account),
    sourceValidAt: timestamp.date,
    usage: accountUsage(account),
  };
}

export function createPowensFinancialSource(
  client: PowensClient,
  config: Pick<
    PowensConfig,
    "fingerprintKey" | "fingerprintKeyVersion" | "sourceTimeZone"
  >,
): FinancialSource {
  return {
    async getExternalSubjectId() {
      return String((await client.getCurrentUser()).id);
    },
    async listAccounts(connectionExternalId) {
      const connectionId = Number(connectionExternalId);
      if (!Number.isInteger(connectionId)) {
        throw new Error("Powens connection external ID must be an integer");
      }
      const response = await client.listAccounts({
        connectionId,
        includeDisabled: true,
      });
      return {
        accounts: response.accounts
          .filter((account) => account.error === null || account.error === undefined)
          .map((account) => normalizeAccount(account, config)),
        failures: [
          ...response.accounts.flatMap((account) =>
            account.error
              ? [{
                  externalId: String(account.id),
                  failure: { code: account.error, kind: "provider_account" },
                }]
              : [],
          ),
          ...response.rejectedAccounts.map((account) => ({
            externalId: account.externalId,
            failure: { code: "invalid_response_item", kind: "malformed" },
          })),
        ],
        isComplete: response.isComplete,
        reportedTotal: response.reportedTotal,
      };
    },
    async listConnections(): Promise<readonly NormalizedConnection[]> {
      const response = await client.listConnections();
      return response.connections.map((connection) => {
        const retrievedAt = new Date();
        return {
          active: connection.active ?? true,
          externalId: String(connection.id),
          institution: {
            externalId: connection.connector.uuid,
            name: connection.connector.name,
          },
          nextTryAt: providerDate(
            connection.next_try,
            config.sourceTimeZone,
            retrievedAt,
          ).date,
          sourceErrorCode: connection.error ?? null,
          sourceState: connection.state ?? null,
          sourceUpdatedAt: providerDate(
            connection.last_update,
            config.sourceTimeZone,
            retrievedAt,
          ).date,
        };
      });
    },
  };
}
