import { randomUUID } from "node:crypto";

import type { OperationContext } from "./context";
import { operationContextStorage } from "./storage";

export function runWithOperationContext<T>(
  context: Pick<OperationContext, "surface">,
  callback: () => T,
): T {
  const operationContext: OperationContext = {
    action_id: `${context.surface}-${randomUUID()}`,
    surface: context.surface,
  };

  return operationContextStorage.run(operationContext, callback);
}
