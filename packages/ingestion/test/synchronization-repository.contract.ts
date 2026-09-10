import { describe, expect, test } from "vitest";

import type { SynchronizationRepository } from "../src/index";

type Harness = Readonly<{ repository: SynchronizationRepository }>;
type HarnessFactory = () => Promise<Harness>;

const run = (actionId: string, sourceKey = "source") => ({
  actionId,
  adapterKey: "contract",
  sourceKey,
  sourceName: `Contract ${sourceKey}`,
});

export function synchronizationRepositoryContract(
  createHarness: HarnessFactory,
): void {
  describe("SynchronizationRepository contract", () => {
    test("allows exactly one concurrent running lease for one source", async () => {
      const { repository } = await createHarness();
      const attempts = await Promise.all([
        repository.startRun(run("first")),
        repository.startRun(run("second")),
      ]);

      expect(attempts.map(({ status }) => status).sort()).toEqual([
        "skipped_already_running",
        "started",
      ]);
    });

    test("allows independent sources to hold running leases", async () => {
      const { repository } = await createHarness();

      await expect(
        Promise.all([
          repository.startRun(run("first", "source-a")),
          repository.startRun(run("second", "source-b")),
        ]),
      ).resolves.toEqual([
        expect.objectContaining({ status: "started" }),
        expect.objectContaining({ status: "started" }),
      ]);
    });

    test("releases a source lease after recording a run failure", async () => {
      const { repository } = await createHarness();
      const first = await repository.startRun(run("failed"));
      if (first.status !== "started") throw new Error("Expected run to start");

      await repository.markRunFailed(first.runId, {
        code: "contract_failure",
        kind: "contract",
      });

      await expect(repository.startRun(run("replacement"))).resolves.toEqual(
        expect.objectContaining({ status: "started" }),
      );
      await expect(repository.finalizeRun(first.runId, "succeeded")).rejects.toThrow(
        /not running/,
      );
    });

    test("rejects a different external subject for an identified source", async () => {
      const { repository } = await createHarness();
      const started = await repository.startRun(run("identity"));
      if (started.status !== "started") throw new Error("Expected run to start");

      await repository.identifyRunSource(started.runId, "subject-a");
      await expect(
        repository.identifyRunSource(started.runId, "subject-a"),
      ).resolves.toBeUndefined();
      await expect(
        repository.identifyRunSource(started.runId, "subject-b"),
      ).rejects.toThrow(/different external subject/);
    });
  });
}
