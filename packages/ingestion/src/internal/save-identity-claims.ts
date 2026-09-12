import type { AccountIdentityEvidence } from "../account-identity";
import { getDatabase } from "@monii/postgres/client";
import { accountIdentityClaims } from "@monii/postgres/schema";
import { and, eq, ne } from "drizzle-orm";

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
    await getDatabase()
      .update(accountIdentityClaims)
      .set({ isCurrent: false, updatedAt: new Date() })
      .where(
        and(
          eq(accountIdentityClaims.externalAccountId, externalAccountId),
          eq(accountIdentityClaims.claimType, claimType),
          eq(accountIdentityClaims.keyVersion, evidence.keyVersion),
          ne(accountIdentityClaims.fingerprint, fingerprint),
          eq(accountIdentityClaims.isCurrent, true),
        ),
      );
    await getDatabase()
      .insert(accountIdentityClaims)
      .values({
        claimType,
        externalAccountId,
        fingerprint,
        firstObservedRunId: runId,
        keyVersion: evidence.keyVersion,
        lastObservedRunId: runId,
      })
      .onConflictDoUpdate({
        target: [
          accountIdentityClaims.externalAccountId,
          accountIdentityClaims.claimType,
          accountIdentityClaims.keyVersion,
          accountIdentityClaims.fingerprint,
        ],
        set: {
          isCurrent: true,
          lastObservedRunId: runId,
          updatedAt: new Date(),
        },
      });
  }
}
