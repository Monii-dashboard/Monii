import path from "node:path";

import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/postgres-js/migrator";

import {
  createDatabase,
  type Database,
} from "@monii/postgres/client";

type DatabaseConnection = {
  db: Database;
  close: () => Promise<void>;
};

export type StartedPostgresTestDatabase = {
  database: DatabaseConnection;
  db: Database;
  postgres: StartedPostgreSqlContainer;
  stop: () => Promise<void>;
};

export async function startPostgresTestDatabase(): Promise<StartedPostgresTestDatabase> {
  let postgres: StartedPostgreSqlContainer;
  try {
    postgres = await new PostgreSqlContainer("postgres:17-alpine").start();
  } catch (cause) {
    throw new Error(
      "PostgreSQL integration tests require a running Docker-compatible container runtime; test databases are provisioned exclusively with Testcontainers.",
      { cause },
    );
  }

  const database = createDatabase(postgres.getConnectionUri());
  try {
    await migrate(database.db, {
      migrationsFolder: path.resolve(import.meta.dirname, "../../drizzle"),
    });
  } catch (cause) {
    await database.close().catch(() => undefined);
    await postgres.stop().catch(() => undefined);
    throw cause;
  }

  return {
    database,
    db: database.db,
    postgres,
    stop: async () => {
      try {
        await database.close();
      } finally {
        await postgres.stop();
      }
    },
  };
}
