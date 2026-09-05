import { synchronizeFinancialSource } from "@monii/application";
import { getOperationContext } from "@monii/runtime/context";
import { log } from "@monii/runtime/log";
import { runWithOperationContext } from "@monii/runtime/operation";
import { createDatabase } from "@monii/server/database";
import {
  createPowensClient,
  createPowensFinancialSource,
  readPowensConfig,
} from "@monii/server/powens";
import { createFinancialRepository } from "@monii/server/wealth";

async function main() {
  const command = process.argv.slice(2).find((argument) => argument !== "--");

  if (command !== "sync") {
    throw new Error("Usage: pnpm cli -- sync");
  }

  await runWithOperationContext({ surface: "cli" }, async () => {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      throw new Error("DATABASE_URL is not configured");
    }

    const database = createDatabase(databaseUrl);

    try {
      log("Daily synchronization started", "sync.started");

      const powensConfig = readPowensConfig();
      const powens = createPowensClient(powensConfig);
      const reporter = {
        report(event: string, fields: Readonly<Record<string, unknown>> = {}) {
          const degraded =
            event.endsWith("failed") || event === "sync.connection_failed";
          const writer = degraded ? log.error : log.info;
          writer("Financial synchronization event", event, { ...fields });
        },
      };

      const result = await synchronizeFinancialSource({
        actionId: getOperationContext().action_id,
        repository: createFinancialRepository(database.db, reporter),
        reporter,
        source: createPowensFinancialSource(powens, powensConfig),
        sourceKey: "powens-default",
        sourceKind: "powens",
        sourceName: "Powens",
      });

      const fields = {
        failed_connection_count: result.failedConnectionCount,
        partial_connection_count: result.partialConnectionCount,
        run_id: result.runId,
        status: result.status,
        successful_connection_count: result.successfulConnectionCount,
      };

      if (
        result.status === "succeeded" ||
        result.status === "skipped_already_running"
      ) {
        log("Daily synchronization completed", "sync.completed", fields);
      } else {
        log.error(
          "Daily synchronization degraded",
          "sync.degraded",
          fields,
        );

        process.exitCode = 1;
      }
    } finally {
      await database.close();
    }
  });
}

main().catch((error) => {
  const failure =
    error instanceof Error
      ? { error_kind: error.name, error_code: "unhandled" }
      : { error_kind: "unexpected", error_code: "unhandled" };
  void runWithOperationContext({ surface: "cli" }, () => {
    log.error("Synchronization command crashed", "sync.crashed", failure);
  });
  process.exitCode = 1;
});
