import { synchronizeSourceInstance } from "@monii/ingestion";
import type { FinancialOperationalReport } from "@monii/ingestion";
import { getOperationContext } from "@monii/runtime/context";
import { log } from "@monii/runtime/log";
import { closeDatabase } from "@monii/postgres/client";
import {
  createPowensClient,
  createPowensFinancialSource,
  readPowensConfig,
} from "@monii/powens";

export async function sync() {
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
      reporter,
      source: createPowensFinancialSource(powens, powensConfig, reporter),
      sourceKey: "powens-default",
      sourceName: "Powens",
    });
  } finally {
    await closeDatabase();
  }
}
