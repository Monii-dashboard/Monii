import { AsyncLocalStorage } from "node:async_hooks";

import { getDatabase, runWithDatabase } from "./client";

type AfterCommitCallback = () => Promise<void> | void;
type TransactionContext = {
  afterCommitCallbacks: AfterCommitCallback[];
};

const transactionContext = new AsyncLocalStorage<TransactionContext>();

export function isInTransaction(): boolean {
  return transactionContext.getStore() !== undefined;
}

export function afterCommit(callback: AfterCommitCallback): void {
  const context = transactionContext.getStore();
  if (!context) {
    throw new Error("afterCommit must be registered inside transaction()");
  }
  context.afterCommitCallbacks.push(callback);
}

export async function transaction<T>(
  callback: () => Promise<T>,
): Promise<T> {
  const parent = transactionContext.getStore();
  const context: TransactionContext = { afterCommitCallbacks: [] };
  const result = await getDatabase().transaction(async (transactionDatabase) =>
    runWithDatabase(transactionDatabase, () =>
      transactionContext.run(context, callback),
    ),
  );

  if (parent) {
    parent.afterCommitCallbacks.push(...context.afterCommitCallbacks);
  } else {
    for (const committed of context.afterCommitCallbacks) await committed();
  }
  return result;
}
