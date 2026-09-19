import {
  ExternalAccount,
  SynchronizationAccountResult,
} from "../models";

import type { SynchronizationFailure } from "../external-financial-source";

export async function saveKnownAccountFailure(input: Readonly<{
  externalId: string;
  failure: SynchronizationFailure;
  runId: string;
  sourceInstanceId: string;
}>): Promise<boolean> {
  const [externalAccount] = await ExternalAccount.findMany({
    externalId: input.externalId,
    sourceInstanceId: input.sourceInstanceId,
  });
  if (!externalAccount) return false;
  await SynchronizationAccountResult.create({
    errorCode: input.failure.code,
    errorKind: input.failure.kind,
    externalAccountId: externalAccount.id,
    sourceInstanceId: input.sourceInstanceId,
    status: input.failure.kind === "malformed" ? "malformed" : "provider_error",
    synchronizationRunId: input.runId,
  });
  return true;
}
