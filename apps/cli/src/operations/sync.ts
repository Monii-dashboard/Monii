import { synchronizeSourceInstance } from "@monii/ingestion";
import { getOperationContext } from "@monii/runtime/context";
import { log } from "@monii/runtime/log";
import { createDatabase } from "@monii/postgres/client";
import { createPostgresSynchronizationRepository } from "@monii/postgres/ingestion";
import {
  createPowensClient,
  createPowensFinancialSource,
  readPowensConfig,
} from "@monii/powens";

export async function sync() {
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
        const safeFields =
          process.env.FINANCIAL_LOG_DETAIL === "local_diagnostic"
            ? fields
            : Object.fromEntries(
                Object.entries(fields).filter(
                  ([field]) =>
                    !(field.includes("external") && field.endsWith("_id")),
                ),
              );
        const degraded =
          event.endsWith("failed") || event.includes("conflict");
        const writer = degraded ? log.error : log.info;
        writer("Financial synchronization event", event, { ...safeFields });
      },
    };

    const result = await synchronizeSourceInstance({
      actionId: getOperationContext().action_id,
      adapterKey: "powens",
      repository: createPostgresSynchronizationRepository(database.db, reporter),
      reporter,
      source: createPowensFinancialSource(powens, powensConfig),
      sourceKey: "powens-default",
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
      log.error("Daily synchronization degraded", "sync.degraded", fields);
    }
    return result;
  } finally {
    await database.close();
  }
}
