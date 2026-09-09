import path from "node:path";

import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { expect, test as baseTest } from "vitest";

import {
  createDatabase,
  type Database,
} from "@monii/postgres/client";

type DatabaseConnection = {
  db: Database;
  close: () => Promise<void>;
};

export const test = baseTest.extend<{
  $test: {
    postgres: StartedPostgreSqlContainer;
    database: DatabaseConnection;
    db: Database;
  };
}>({
  postgres: async ({}, provideFixture) => {
    let container: StartedPostgreSqlContainer;
    try {
      container = await new PostgreSqlContainer("postgres:17-alpine").start();
    } catch (cause) {
      throw new Error(
        "PostgreSQL integration tests require a running Docker-compatible container runtime; test databases are provisioned exclusively with Testcontainers.",
        { cause },
      );
    }

    try {
      await provideFixture(container);
    } finally {
      await container.stop();
    }
  },
  database: async ({ postgres }, provideFixture) => {
    const connection = createDatabase(postgres.getConnectionUri());

    try {
      await migrate(connection.db, {
        migrationsFolder: path.resolve(import.meta.dirname, "../../drizzle"),
      });
      await provideFixture(connection);
    } finally {
      await connection.close();
    }
  },
  db: async ({ database }, provideFixture) => {
    await provideFixture(database.db);
  },
});

export { expect };
