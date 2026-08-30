import { getOperationContext } from "./context";

export type LogFields = Record<string, unknown>;

export type Log = (event: string, fields?: LogFields) => void;

export const log: Log = (event, fields = {}) => {
  const context = getOperationContext();

  // Add levels, redaction, safer serialization, configurable sinks, metrics,
  // and tracing integration when their concrete requirements are known.
  console.log(
    JSON.stringify({
      ...fields,
      event,
      ...context,
    }),
  );
};
