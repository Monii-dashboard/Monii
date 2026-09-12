import { AsyncLocalStorage } from "node:async_hooks";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

export const runtimeDatabaseRole = "monii_runtime";

export function createDatabase(
  databaseUrl: string,
  options: Readonly<{ role?: string }> = {},
) {
  const client = postgres(
    databaseUrl,
    options.role ? { connection: { role: options.role } } : {},
  );
  const db = drizzle(client, { schema });
  return { db, close: () => client.end() };
}

let database: ReturnType<typeof createDatabase> | undefined;
const databaseContext = new AsyncLocalStorage<ActiveDatabase>();

export function runWithDatabase<T>(db: ActiveDatabase, callback: () => T): T {
  return databaseContext.run(db, callback);
}

export function getDatabase() {
  const activeDatabase = databaseContext.getStore();
  if (activeDatabase) return activeDatabase;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not configured");
  database ??= createDatabase(databaseUrl, { role: runtimeDatabaseRole });
  return database.db;
}

export async function closeDatabase(): Promise<void> {
  const configuredDatabase = database;
  database = undefined;
  await configuredDatabase?.close();
}

export type Database = ReturnType<typeof createDatabase>["db"];
export type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];
export type ActiveDatabase = Database | DatabaseTransaction;
