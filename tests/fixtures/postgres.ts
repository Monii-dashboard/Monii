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
} from "@monii/server/database";

type DatabaseConnection = {
  db: Database;
  close: () => Promise<void>;
};

export const test = baseTest.extend<{
  $worker: {
    postgres: StartedPostgreSqlContainer;
    database: DatabaseConnection;
  };
  $test: {
    db: DatabaseTransaction;
  };
}>({
  postgres: [
    async ({}, provideFixture) => {
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
      const connection = createDatabase(container.getConnectionUri());

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
