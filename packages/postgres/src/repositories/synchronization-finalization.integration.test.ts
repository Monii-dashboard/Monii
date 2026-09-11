import { createPostgresSynchronizationRepository } from "@monii/postgres/ingestion";
import { expect, it } from "@testkit/integration";
import { getIntegrationDatabase } from "@testkit/postgres";
import { sql } from "drizzle-orm";

it("rolls back the run transition when snapshot creation fails", async () => {
  const db = getIntegrationDatabase();
  const repository = createPostgresSynchronizationRepository();
  const started = await repository.startRun({
    actionId: "rollback",
    adapterKey: "test",
    sourceKey: "rollback-source",
    sourceName: "Rollback source",
  });
  expect(started.status).toBe("started");
  if (started.status !== "started") throw new Error("Expected the run to start");
  await db.execute(sql`
    insert into wealth.snapshots (
      reason,
      causation_id,
      action_id,
      synchronization_run_id,
      headline_amount,
      duplicate_adjusted_estimate_amount,
      is_complete,
      contributing_account_count,
      missing_account_count
    ) values (
      'synchronization',
      ${started.runId},
      'preexisting-snapshot',
      ${started.runId},
      0,
      0,
      true,
      0,
      0
    )
  `);

  await expect(repository.finalizeRun(started.runId, "succeeded")).rejects.toThrow();
  const durable = await db.execute<{
    finished_at: Date | null;
    snapshot_count: number;
    status: string;
  }>(sql`
    select
      r.finished_at,
      (select count(*)::int from wealth.snapshots) snapshot_count,
      r.status
    from ingestion.synchronization_runs r
    where r.id = ${started.runId}
  `);
  expect(durable[0]).toEqual({
    finished_at: null,
    snapshot_count: 1,
    status: "running",
  });
  await repository.markRunFailed(started.runId, {
    code: "test_cleanup",
    kind: "test",
  });
});
