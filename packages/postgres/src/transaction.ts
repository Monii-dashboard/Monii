import { AsyncLocalStorage } from "node:async_hooks";

import type { PgTransactionConfig } from "drizzle-orm/pg-core";

import {
  getDatabase,
  runWithDatabase,
  type Database,
  type DatabaseTransaction,
} from "./client";

type AfterCommitCallback = () => Promise<void> | void;
type AfterCommitFailureHandler = (error: unknown) => Promise<void> | void;
type AfterCommitEffect = Readonly<{
  callback: AfterCommitCallback;
  onFailure?: AfterCommitFailureHandler;
}>;
type TransactionContext = {
  afterCommitEffects: AfterCommitEffect[];
};

export type TransactionOptions = PgTransactionConfig;

const transactionContext = new AsyncLocalStorage<TransactionContext>();

export function isInTransaction(): boolean {
  return transactionContext.getStore() !== undefined;
}

export function afterCommit(
  callback: AfterCommitCallback,
  options: Readonly<{ onFailure?: AfterCommitFailureHandler }> = {},
): void {
  const context = transactionContext.getStore();
  if (!context) {
    throw new Error("afterCommit must be registered inside transaction()");
  }
  context.afterCommitEffects.push({ callback, onFailure: options.onFailure });
}

export async function transaction<T>(
  callback: () => Promise<T>,
  options?: TransactionOptions,
): Promise<T> {
  const parent = transactionContext.getStore();
  if (parent && options) {
    throw new Error("Nested transactions cannot change transaction options");
  }
  const context: TransactionContext = { afterCommitEffects: [] };
  const run = async (transactionDatabase: DatabaseTransaction) =>
    runWithDatabase(transactionDatabase, () =>
      transactionContext.run(context, callback),
    );
  const database = getDatabase();
  const result = options
    ? await (database as Database).transaction(run, options)
    : await database.transaction(run);

  if (parent) {
    parent.afterCommitEffects.push(...context.afterCommitEffects);
  } else {
    for (const effect of context.afterCommitEffects) {
      try {
        await effect.callback();
      } catch (error) {
        try {
          await effect.onFailure?.(error);
        } catch {
          // The database is already committed. A failure observer cannot change
          // the durable operation's result either.
        }
      }
    }
  }
  return result;
}
