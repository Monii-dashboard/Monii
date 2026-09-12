import { SynchronizationConnectionResult } from "@monii/postgres/models";
import { transaction } from "@monii/postgres/transaction";

import type {
  NormalizedExternalConnection,
  SynchronizationFailure,
} from "../../external-financial-source";
import { ensureConnection } from "../ensure-connection";

export async function recordConnectionFailure(
  runId: string,
  connection: NormalizedExternalConnection,
  failure: SynchronizationFailure,
): Promise<void> {
  await transaction(async () => {
    const context = await ensureConnection(runId, connection);
    await SynchronizationConnectionResult.create({
      connectionId: context.connectionId,
      errorCode: failure.code,
      errorKind: failure.kind,
      failedAccountCount: 0,
      reportedActive: connection.active,
      reportedState: connection.sourceState,
      retryAfter: connection.nextTryAt,
      sourceInstanceId: context.sourceInstanceId,
      sourceUpdatedAt: connection.sourceUpdatedAt,
      status: "failed",
      successfulAccountCount: 0,
      synchronizationRunId: runId,
    });
  });
}
