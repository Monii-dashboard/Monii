import type { FinancialOperationalReport } from "@monii/ingestion";
import { createPostgresSynchronizationRepository } from "@monii/postgres/ingestion";
import { expect, it } from "@testkit/integration";
import { getIntegrationDatabase } from "@testkit/postgres";
import { sql } from "drizzle-orm";

it("marks a run older than two hours abandoned before starting its replacement", async () => {
  const db = getIntegrationDatabase();
  const reports: FinancialOperationalReport[] = [];
  const repository = createPostgresSynchronizationRepository(undefined, {
    report: (record) => reports.push(record),
  });
  const first = await repository.startRun({
    actionId: "abandoned",
    adapterKey: "test",
    sourceKey: "abandonment-source",
    sourceName: "Abandonment source",
  });
  expect(first.status).toBe("started");
  if (first.status !== "started") throw new Error("Expected the first run to start");
  await db.execute(sql`
    update ingestion.synchronization_runs
    set started_at = now() - interval '3 hours'
    where id = ${first.runId}
  `);

  const replacement = await repository.startRun({
    actionId: "replacement",
    adapterKey: "test",
    sourceKey: "abandonment-source",
    sourceName: "Abandonment source",
  });
  expect(replacement.status).toBe("started");
  if (replacement.status !== "started") {
    throw new Error("Expected a replacement run to start");
  }
  const durable = await db.execute<{
    action_id: string;
    error_code: string | null;
    error_kind: string | null;
    finished: boolean;
    status: string;
  }>(sql`
    select
      action_id,
      error_code,
      error_kind,
      finished_at is not null finished,
      status
    from ingestion.synchronization_runs
    order by started_at
  `);
  expect(durable).toEqual([
    {
      action_id: "abandoned",
      error_code: "abandoned",
      error_kind: "orchestration",
      finished: true,
      status: "failed",
    },
    {
      action_id: "replacement",
      error_code: null,
      error_kind: null,
      finished: false,
      status: "running",
    },
  ]);
  expect(reports).toEqual([
    expect.objectContaining({
      event: "ingestion.run.abandoned",
      fields: expect.objectContaining({
        abandoned_run_id: first.runId,
        replacement_run_id: replacement.runId,
      }),
    }),
  ]);
  await repository.markRunFailed(replacement.runId, {
    code: "test_cleanup",
    kind: "test",
  });
});
