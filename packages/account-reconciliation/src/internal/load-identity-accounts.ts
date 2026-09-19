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
  externalAccountObservations,
  externalAccounts,
  reportedAccountValuations,
} from "@monii/postgres/schema/ingestion";
import { desc, eq, sql } from "drizzle-orm";

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
  const db = getDatabase();
  const latestReportedValuation = db
    .select({ currency: accountValuationCandidates.currency })
    .from(externalAccountObservations)
    .innerJoin(
      reportedAccountValuations,
      eq(
        reportedAccountValuations.externalAccountObservationId,
        externalAccountObservations.id,
      ),
    )
    .innerJoin(
      accountValuationCandidates,
      eq(
        accountValuationCandidates.id,
        reportedAccountValuations.valuationCandidateId,
      ),
    )
    .where(
      eq(
        externalAccountObservations.externalAccountId,
        externalAccounts.id,
      ),
    )
    .orderBy(
      desc(externalAccountObservations.observedAt),
      desc(externalAccountObservations.id),
      desc(accountValuationCandidates.recordedAt),
      desc(accountValuationCandidates.id),
    )
    .limit(1)
    .as("latest_reported_account_valuation");
  const referenceRows = await db
    .select({
      accountId: externalAccounts.accountId,
      category: accounts.category,
      currency: latestReportedValuation.currency,
      externalAccountId: externalAccounts.id,
      institutionId: accounts.institutionId,
    })
    .from(externalAccounts)
    .innerJoin(accounts, eq(externalAccounts.accountId, accounts.id))
    .leftJoinLateral(latestReportedValuation, sql`true`);

  const claims = await AccountIdentityClaim.query("current").load();
  const claimsByExternalAccount = new Map<string, typeof claims>();
  for (const claim of claims) {
    claimsByExternalAccount.set(claim.externalAccountId, [
      ...(claimsByExternalAccount.get(claim.externalAccountId) ?? []),
      claim,
    ]);
  }

  const accountsWithIdentity: IdentityAccount[] = [];
  for (const row of referenceRows) {
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
