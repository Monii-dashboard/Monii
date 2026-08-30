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

  // Add levels, redaction, safer serialization, configurable sinks, metrics,
  // and tracing integration when their concrete requirements are known.
  console.log(
    JSON.stringify({
      level,
      ...fields,
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
