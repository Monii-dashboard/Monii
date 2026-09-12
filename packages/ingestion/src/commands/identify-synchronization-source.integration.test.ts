import { expect, it } from "@testkit/integration";

import { identifySynchronizationSource } from "./identify-synchronization-source";
import { startSynchronizationRun } from "./start-synchronization-run";

it("rejects a different external subject for an identified source", async () => {
  const started = await startSynchronizationRun({
    actionId: "identity",
    adapterKey: "test",
    sourceKey: "identified-source",
    sourceName: "Identified source",
  });
  if (started.status !== "started") throw new Error("Expected run to start");

  await expect(
    identifySynchronizationSource(started.runId, "subject-a"),
  ).resolves.toBeUndefined();
  await expect(
    identifySynchronizationSource(started.runId, "subject-a"),
  ).resolves.toBeUndefined();
  await expect(
    identifySynchronizationSource(started.runId, "subject-b"),
  ).rejects.toThrow(/different external subject/);
});
