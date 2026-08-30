import { AsyncLocalStorage } from "node:async_hooks";

import type { OperationContext } from "./context";

export const operationContextStorage =
  new AsyncLocalStorage<OperationContext>();
