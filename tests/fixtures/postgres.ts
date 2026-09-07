import path from "node:path";

import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { TransactionRollbackError } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { expect, test as baseTest } from "vitest";

import {
  createDatabase,
  type Database,
  type DatabaseTransaction,
} from "@monii/postgres/client";

type DatabaseConnection = {
  db: Database;
  close: () => Promise<void>;
};

export const test = baseTest.extend<{
  $worker: {
    postgres: StartedPostgreSqlContainer | null;
    database: DatabaseConnection;
  };
  $test: {
    db: DatabaseTransaction;
  };
}>({
  postgres: [
    async ({}, provideFixture) => {
      if (process.env.TEST_DATABASE_URL) {
        await provideFixture(null);
        return;
      }
      const container = await new PostgreSqlContainer("postgres:17-alpine").start();

      try {
        await provideFixture(container);
      } finally {
        await container.stop();
      }
    },
    { scope: "worker" },
  ],
  database: [
    async ({ postgres: container }, provideFixture) => {
      const databaseUrl =
        process.env.TEST_DATABASE_URL ?? container?.getConnectionUri();
      if (!databaseUrl) throw new Error("PostgreSQL test database is unavailable");
      const connection = createDatabase(databaseUrl);

      await migrate(connection.db, {
        migrationsFolder: path.resolve(import.meta.dirname, "../../drizzle"),
      });

      try {
        await provideFixture(connection);
      } finally {
        await connection.close();
      }
    },
    { scope: "worker" },
  ],
  db: async ({ database }, provideFixture) => {
    let testFinished = false;

    try {
      await database.db.transaction(async (transaction) => {
        await provideFixture(transaction);
        testFinished = true;
        transaction.rollback();
      });
    } catch (error) {
      if (!testFinished || !(error instanceof TransactionRollbackError)) {
        throw error;
      }
    }
  },
});

export { expect };
