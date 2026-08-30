import { operationContextStorage } from "./storage";

export type OperationSurface = "cli" | "console" | "web";

export type OperationContext = Readonly<{
  action_id: string;
  surface: OperationSurface;
}>;

export function getOperationContext(): OperationContext {
  const context = operationContextStorage.getStore();

  if (!context) {
    throw new Error("Operation context is not available outside an operation");
  }

  return context;
}
