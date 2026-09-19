import { Institution } from "@monii/accounts/models";
import {
  Connection,
  ExternalInstitution,
  SynchronizationRun,
} from "../models";

import type { NormalizedExternalConnection } from "../external-financial-source";

export type StoredConnectionContext = Readonly<{
  connectionId: string;
  institutionId: string;
  sourceInstanceId: string;
}>;

export async function ensureConnection(
  runId: string,
  connection: NormalizedExternalConnection,
): Promise<StoredConnectionContext> {
  const run = await SynchronizationRun.find(runId);
  if (!run) throw new Error(`Synchronization run ${runId} does not exist`);

  const [storedExternalInstitution] = await ExternalInstitution.findMany({
    externalId: connection.institution.externalId,
    sourceInstanceId: run.sourceInstanceId,
  });
  let externalInstitution = storedExternalInstitution;
  if (!externalInstitution) {
    const institution = await Institution.create({
      name: connection.institution.reportedName,
    });
    externalInstitution = await ExternalInstitution.create({
      externalId: connection.institution.externalId,
      institutionId: institution.id,
      reportedName: connection.institution.reportedName,
      sourceInstanceId: run.sourceInstanceId,
    });
  } else {
    const updatedExternalInstitution = await ExternalInstitution.update(
      externalInstitution.id,
      {
          lastObservedAt: new Date(),
          reportedName: connection.institution.reportedName,
      },
    );
    if (!updatedExternalInstitution) {
      throw new Error("External institution disappeared while updating");
    }
    externalInstitution = updatedExternalInstitution;
  }
  if (!externalInstitution) {
    throw new Error("Failed to persist external institution");
  }

  const [existingConnection] = await Connection.findMany({
    externalId: connection.externalId,
    sourceInstanceId: run.sourceInstanceId,
  });
  const storedConnection = existingConnection
    ? await Connection.update(existingConnection.id, {
        archivedAt: null,
        externalInstitutionId: externalInstitution.id,
        updatedAt: new Date(),
      })
    : await Connection.create({
        externalId: connection.externalId,
        externalInstitutionId: externalInstitution.id,
        sourceInstanceId: run.sourceInstanceId,
      });
  if (!storedConnection) throw new Error("Failed to persist connection");

  return {
    connectionId: storedConnection.id,
    institutionId: externalInstitution.institutionId,
    sourceInstanceId: run.sourceInstanceId,
  };
}
