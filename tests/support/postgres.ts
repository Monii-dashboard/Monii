import path from "node:path";

import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";

import {
  createDatabase,
  type Database,
  runtimeDatabaseRole,
} from "@monii/postgres/client";

type DatabaseConnection = {
  db: Database;
  close: () => Promise<void>;
};

export type StartedPostgresTestDatabase = {
  database: DatabaseConnection;
  db: Database;
  runtimeDatabase: DatabaseConnection;
  runtimeDb: Database;
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
  let runtimeDatabase: DatabaseConnection | undefined;
  try {
    await migrate(database.db, {
      migrationsFolder: path.resolve(import.meta.dirname, "../../drizzle"),
    });
    runtimeDatabase = createDatabase(postgres.getConnectionUri(), {
      role: runtimeDatabaseRole,
    });
    await runtimeDatabase.db.execute(sql`select 1`);
  } catch (cause) {
    await runtimeDatabase?.close().catch(() => undefined);
    await database.close().catch(() => undefined);
    await postgres.stop().catch(() => undefined);
    throw cause;
  }

  return {
    database,
    db: database.db,
    runtimeDatabase,
    runtimeDb: runtimeDatabase.db,
    postgres,
    stop: async () => {
      try {
        await runtimeDatabase.close();
      } finally {
        try {
          await database.close();
        } finally {
          await postgres.stop();
        }
      }
    },
  };
}
