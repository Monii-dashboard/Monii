import type { OperationContext } from "./context";
import { operationContextStorage } from "./storage";

export function runWithOperationContext<T>(
  context: OperationContext,
  callback: () => T,
): T {
  // Add new surfaces and cross-cutting metadata, such as trace or parent
  // operation identifiers, only when an execution flow needs them.
  return operationContextStorage.run(context, callback);
}
