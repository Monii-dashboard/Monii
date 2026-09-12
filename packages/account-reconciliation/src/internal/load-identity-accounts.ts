import type {
  AccountCategory,
  AccountIdentityEvidence,
} from "@monii/accounts";
import { AccountIdentityClaim } from "@monii/ingestion/models";
import { getDatabase } from "@monii/postgres/client";
import {
  accounts,
  accountValuationCandidates,
} from "@monii/postgres/schema/financial";
import {
  accountIdentityClaims,
  externalAccounts,
  reportedAccountValuations,
} from "@monii/postgres/schema/ingestion";
import { desc, eq } from "drizzle-orm";

import type { IdentityAccount } from "../assess-account-identity";

function identityEvidence(
  claims: readonly (typeof accountIdentityClaims.$inferSelect)[],
): AccountIdentityEvidence | null {
  const representative = claims[0];
  if (!representative) return null;
  const value = (claimType: string) =>
    claims.find(
      (claim) =>
        claim.claimType === claimType &&
        claim.keyVersion === representative.keyVersion,
    )?.fingerprint ?? null;
  return {
    accountNumberFingerprint: value("account_number"),
    ibanFingerprint: value("iban"),
    keyVersion: representative.keyVersion,
    reportedNameFingerprint: value("reported_name"),
  };
}

export async function loadIdentityAccounts(): Promise<IdentityAccount[]> {
  const referenceRows = await getDatabase()
    .select({
      accountId: externalAccounts.accountId,
      category: accounts.category,
      currency: accountValuationCandidates.currency,
      externalAccountId: externalAccounts.id,
      institutionId: accounts.institutionId,
    })
    .from(externalAccounts)
    .innerJoin(accounts, eq(externalAccounts.accountId, accounts.id))
    .leftJoin(
      reportedAccountValuations,
      eq(reportedAccountValuations.accountId, accounts.id),
    )
    .leftJoin(
      accountValuationCandidates,
      eq(
        accountValuationCandidates.id,
        reportedAccountValuations.valuationCandidateId,
      ),
    )
    .orderBy(desc(accountValuationCandidates.recordedAt));
  const firstByExternalAccount = new Map<
    string,
    (typeof referenceRows)[number]
  >();
  for (const row of referenceRows) {
    if (!firstByExternalAccount.has(row.externalAccountId)) {
      firstByExternalAccount.set(row.externalAccountId, row);
    }
  }

  const claims = await AccountIdentityClaim.query("current").load();
  const claimsByExternalAccount = new Map<string, typeof claims>();
  for (const claim of claims) {
    claimsByExternalAccount.set(claim.externalAccountId, [
      ...(claimsByExternalAccount.get(claim.externalAccountId) ?? []),
      claim,
    ]);
  }

  const accountsWithIdentity: IdentityAccount[] = [];
  for (const row of firstByExternalAccount.values()) {
    const evidence = identityEvidence(
      claimsByExternalAccount.get(row.externalAccountId) ?? [],
    );
    if (!evidence) continue;
    accountsWithIdentity.push({
      accountId: row.accountId,
      category: row.category as AccountCategory,
      currency: row.currency,
      evidence,
      externalAccountId: row.externalAccountId,
      institutionId: row.institutionId,
    });
  }
  return accountsWithIdentity;
}
