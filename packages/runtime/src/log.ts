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

const ansi = {
  reset: "\u001B[0m",
  dim: "\u001B[2m",
  red: "\u001B[31m",
  yellow: "\u001B[33m",
  cyan: "\u001B[36m",
  green: "\u001B[32m",
} as const;

function color(value: string, code: keyof typeof ansi) {
  return `${ansi[code]}${value}${ansi.reset}`;
}

function prettyLogsEnabled() {
  return process.env.MONII_PRETTY_LOGS?.toLowerCase() === "true";
}

function levelLabel(level: LogLevel) {
  switch (level) {
    case "error":
      return color("ERROR", "red");
    case "warn":
      return color("WARN ", "yellow");
    case "info":
      return color("INFO ", "green");
  }
}

function formatPrettyLog(record: Record<string, unknown>) {
  const { action_id, event, level, message, msg, surface, ...fields } = record;
  const text = message ?? msg;
  const details = Object.keys(fields).length === 0 ? "" : ` ${JSON.stringify(fields)}`;

  return [
    color(new Date().toISOString(), "dim"),
    levelLabel(level as LogLevel),
    color(`[${String(surface)}]`, "cyan"),
    color(`[${String(action_id)}]`, "dim"),
    event === undefined ? "" : color(String(event), "cyan"),
    text === undefined ? "" : String(text),
  ]
    .filter(Boolean)
    .join(" ") + details;
}

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
  const record = {
    level,
    ...safeFields,
    ...(message === undefined ? {} : { message }),
    ...(event === undefined ? {} : { event }),
    ...context,
  };

  console.log(prettyLogsEnabled() ? formatPrettyLog(record) : JSON.stringify(record));
}

export const log: Log = Object.assign(
  (...args: LogArguments) => write("info", ...args),
  {
    info: (...args: LogArguments) => write("info", ...args),
    warning: (...args: LogArguments) => write("warn", ...args),
    error: (...args: LogArguments) => write("error", ...args),
  },
);
