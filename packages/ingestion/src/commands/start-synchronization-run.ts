import {
  SourceInstance,
  SynchronizationRun,
} from "../models";
import { transaction } from "@monii/postgres/transaction";

import type { FinancialOperationalReport, SynchronizationReporter } from "../reporting";
import { isUniqueViolation } from "../internal/is-unique-violation";
import { reportAfterCommit } from "../internal/report-after-commit";

export type StartSynchronizationRunInput = Readonly<{
  actionId: string;
  adapterKey: string;
  sourceKey: string;
  sourceName: string;
}>;

export type StartSynchronizationRunResult =
  | Readonly<{ runId: string; status: "started" }>
  | Readonly<{ status: "skipped_already_running" }>;

export async function startSynchronizationRun(
  input: StartSynchronizationRunInput,
  reporter?: SynchronizationReporter,
): Promise<StartSynchronizationRunResult> {
  try {
    return await transaction(async () => {
      const [storedSource] = await SourceInstance.findMany({
        sourceKey: input.sourceKey,
      });
      const source = storedSource
        ? await SourceInstance.update(storedSource.id, {
            adapterKey: input.adapterKey,
            name: input.sourceName,
            updatedAt: new Date(),
          })
        : await SourceInstance.create({
            adapterKey: input.adapterKey,
            name: input.sourceName,
            sourceKey: input.sourceKey,
          });
      if (!source) throw new Error("Failed to persist source instance");

      const abandonedRunIds = await SynchronizationRun.abandonStaleRunning(
        source.id,
        new Date(Date.now() - 2 * 60 * 60 * 1_000),
      );
      const run = await SynchronizationRun.create({
        actionId: input.actionId,
        sourceInstanceId: source.id,
        startedAt: new Date(),
      });
      const reports: FinancialOperationalReport[] = abandonedRunIds.map(
        (abandonedRunId) => ({
          event: "ingestion.run.abandoned",
          fields: {
            abandoned_run_id: abandonedRunId,
            replacement_run_id: run.id,
            timeout_hours: 2,
          },
          level: "warn",
          message: "Abandoned financial synchronization run marked as failed",
        }),
      );
      reportAfterCommit(reporter, reports);
      return { runId: run.id, status: "started" as const };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { status: "skipped_already_running" };
    }
    throw error;
  }
}
