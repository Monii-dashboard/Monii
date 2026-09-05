import { getOperationContext } from "./context";

export type LogFields = Record<string, unknown>;

export type LogLevel = "info" | "warn" | "error";

type LogArguments =
  | [fields: LogFields]
  | [message: string, fields?: LogFields]
  | [message: string, event: string, fields?: LogFields];

export type Log = {
  (...args: LogArguments): void;
  info: (...args: LogArguments) => void;
  warning: (...args: LogArguments) => void;
  error: (...args: LogArguments) => void;
};

function sanitize(value: unknown, key = "", depth = 0): unknown {
  if (/iban|account_number|fingerprint_key|secret|token/i.test(key)) {
    return "[redacted]";
  }
  if (value instanceof Error) return { name: value.name };
  if (typeof value === "bigint") return value.toString();
  if (depth >= 6) return "[truncated]";
  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item, "", depth + 1));
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        sanitize(childValue, childKey, depth + 1),
      ]),
    );
  }
  return value;
}

function write(level: LogLevel, ...args: LogArguments) {
  let message: string | undefined;
  let event: string | undefined;
  let fields: LogFields;

  if (typeof args[0] === "string") {
    message = args[0];
    if (typeof args[1] === "string") {
      event = args[1];
      fields = args[2] ?? {};
    } else {
      fields = args[1] ?? {};
    }
  } else {
    fields = args[0];
  }

  const context = getOperationContext();

  const safeFields = sanitize(fields) as LogFields;
  console.log(
    JSON.stringify({
      level,
      ...safeFields,
      ...(message === undefined ? {} : { message }),
      ...(event === undefined ? {} : { event }),
      ...context,
    }),
  );
}

export const log: Log = Object.assign(
  (...args: LogArguments) => write("info", ...args),
  {
    info: (...args: LogArguments) => write("info", ...args),
    warning: (...args: LogArguments) => write("warn", ...args),
    error: (...args: LogArguments) => write("error", ...args),
  },
);
