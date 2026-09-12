import { expect, expectTypeOf, it } from "@testkit/integration";

import { SourceInstance, SynchronizationRun } from ".";

it("loads the latest synchronization status through its typed named query", async () => {
  const source = await SourceInstance.create({
    adapterKey: "test",
    name: "Named query source",
    sourceKey: "named-query-source",
  });
  await SynchronizationRun.create({
    actionId: "older",
    finishedAt: new Date("2026-09-11T08:30:00.000Z"),
    sourceInstanceId: source.id,
    startedAt: new Date("2026-09-11T08:00:00.000Z"),
    status: "failed",
  });
  await SynchronizationRun.create({
    actionId: "latest",
    finishedAt: new Date("2026-09-11T09:30:00.000Z"),
    sourceInstanceId: source.id,
    startedAt: new Date("2026-09-11T09:00:00.000Z"),
    status: "succeeded",
  });

  const latest = await SynchronizationRun.query("latest_status").loadOne();

  expect(latest).toEqual({ status: "succeeded" });
  expectTypeOf(latest).toEqualTypeOf<{ status: string } | null>();
  await expect(SynchronizationRun.query("latest_status").count()).resolves.toBe(
    1,
  );
});
