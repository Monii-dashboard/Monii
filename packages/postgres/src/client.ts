import { AsyncLocalStorage } from "node:async_hooks";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

export function createDatabase(databaseUrl: string) {
  const client = postgres(databaseUrl);
  const db = drizzle(client, { schema });
  return { db, close: () => client.end() };
}

let database: ReturnType<typeof createDatabase> | undefined;
const databaseContext = new AsyncLocalStorage<Database>();

export function runWithDatabase<T>(db: Database, callback: () => T): T {
  return databaseContext.run(db, callback);
}

export function getDatabase() {
  const activeDatabase = databaseContext.getStore();
  if (activeDatabase) return activeDatabase;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not configured");
  database ??= createDatabase(databaseUrl);
  return database.db;
}

export type Database = ReturnType<typeof createDatabase>["db"];
export type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];
