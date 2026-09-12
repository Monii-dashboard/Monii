import { expect, it } from "@testkit/integration";
import { getIntegrationDatabase } from "@testkit/postgres";
import { sql } from "drizzle-orm";

import type { FinancialOperationalReport } from "../reporting";
import { markSynchronizationRunFailed } from "./mark-synchronization-run-failed";
import { startSynchronizationRun } from "./start-synchronization-run";

const run = (actionId: string, sourceKey = "source") => ({
  actionId,
  adapterKey: "test",
  sourceKey,
  sourceName: `Test ${sourceKey}`,
});

it("allows exactly one concurrent running synchronization for one source", async () => {
  const attempts = await Promise.all([
    startSynchronizationRun(run("first")),
    startSynchronizationRun(run("second")),
  ]);

  expect(attempts.map(({ status }) => status).sort()).toEqual([
    "skipped_already_running",
    "started",
  ]);
});

it("allows different sources to synchronize concurrently", async () => {
  await expect(
    Promise.all([
      startSynchronizationRun(run("first", "source-a")),
      startSynchronizationRun(run("second", "source-b")),
    ]),
  ).resolves.toEqual([
    expect.objectContaining({ status: "started" }),
    expect.objectContaining({ status: "started" }),
  ]);
});

it("allows a replacement after a run is marked failed", async () => {
  const first = await startSynchronizationRun(run("failed"));
  if (first.status !== "started") throw new Error("Expected run to start");

  await markSynchronizationRunFailed(first.runId, {
    code: "test_failure",
    kind: "test",
  });

  await expect(startSynchronizationRun(run("replacement"))).resolves.toEqual(
    expect.objectContaining({ status: "started" }),
  );
});

it("marks a run older than two hours abandoned before replacing it", async () => {
  const db = getIntegrationDatabase();
  const reports: FinancialOperationalReport[] = [];
  const reporter = {
    report: (record: FinancialOperationalReport) => reports.push(record),
  };
  const first = await startSynchronizationRun(run("abandoned"), reporter);
  if (first.status !== "started") throw new Error("Expected run to start");
  // Aging immutable start metadata is a PostgreSQL-specific test precondition.
  await db.transaction(async (transaction) => {
    await transaction.execute(
      sql`set local session_replication_role = replica`,
    );
    await transaction.execute(sql`
      update ingestion.synchronization_runs
      set started_at = now() - interval '3 hours'
      where id = ${first.runId}
    `);
  });

  const replacement = await startSynchronizationRun(
    run("replacement"),
    reporter,
  );
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
});
