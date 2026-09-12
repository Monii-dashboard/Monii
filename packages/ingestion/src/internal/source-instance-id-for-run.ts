import { SynchronizationRun } from "@monii/postgres/models";

export async function sourceInstanceIdForRun(runId: string): Promise<string> {
  const run = await SynchronizationRun.find(runId);
  if (!run) throw new Error(`Synchronization run ${runId} does not exist`);
  return run.sourceInstanceId;
}
