import { synchronizeSourceInstance } from "@monii/ingestion";
import type { FinancialOperationalReport } from "@monii/ingestion";
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
    const powensConfig = readPowensConfig();
    const powens = createPowensClient(powensConfig);
    const reporter = {
      report({ event, fields = {}, level, message }: FinancialOperationalReport) {
        const safeFields =
          process.env.FINANCIAL_LOG_DETAIL === "local_diagnostic"
            ? fields
            : Object.fromEntries(
                Object.entries(fields).filter(
                  ([field]) =>
                    !(field.includes("external") && field.endsWith("_id")),
                ),
              );
        log[level](message, event, { ...safeFields });
      },
    };

    return await synchronizeSourceInstance({
      actionId: getOperationContext().action_id,
      adapterKey: "powens",
      repository: createPostgresSynchronizationRepository(database.db, reporter),
      reporter,
      source: createPowensFinancialSource(powens, powensConfig, reporter),
      sourceKey: "powens-default",
      sourceName: "Powens",
    });
  } finally {
    await database.close();
  }
}
