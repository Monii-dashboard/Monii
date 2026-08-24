import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

function createDatabase() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  const client = postgres(databaseUrl);

  return drizzle(client, { schema });
}

let database: ReturnType<typeof createDatabase> | undefined;

export function getDb() {
  database ??= createDatabase();

  return database;
}
