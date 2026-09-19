import { SourceInstance } from "../models";
import { transaction } from "@monii/postgres/transaction";

import { sourceInstanceIdForRun } from "../internal/source-instance-id-for-run";

export async function identifySynchronizationSource(
  runId: string,
  externalSubjectId: string,
): Promise<void> {
  await transaction(async () => {
    const sourceInstanceId = await sourceInstanceIdForRun(runId);
    const source = await SourceInstance.find(sourceInstanceId);
    if (!source) throw new Error("Synchronization source instance does not exist");
    if (
      source.externalSubjectId &&
      source.externalSubjectId !== externalSubjectId
    ) {
      throw new Error(
        `Source instance ${source.sourceKey} is configured for a different external subject`,
      );
    }
    await SourceInstance.update(source.id, {
      externalSubjectId,
      updatedAt: new Date(),
    });
  });
}
