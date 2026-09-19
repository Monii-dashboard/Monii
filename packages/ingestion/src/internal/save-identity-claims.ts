import type { AccountIdentityEvidence } from "@monii/accounts";
import { AccountIdentityClaim } from "../models";

export async function saveIdentityClaims(
  runId: string,
  externalAccountId: string,
  evidence: AccountIdentityEvidence,
): Promise<void> {
  const claims = [
    ["iban", evidence.ibanFingerprint],
    ["account_number", evidence.accountNumberFingerprint],
    ["reported_name", evidence.reportedNameFingerprint],
  ] as const;

  for (const [claimType, fingerprint] of claims) {
    if (!fingerprint) continue;
    await AccountIdentityClaim.recordCurrent({
      claimType,
      externalAccountId,
      fingerprint,
      keyVersion: evidence.keyVersion,
      synchronizationRunId: runId,
    });
  }
}
