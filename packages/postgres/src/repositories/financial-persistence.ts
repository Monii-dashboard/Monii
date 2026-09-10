import { randomUUID } from "node:crypto";

import {
  connectedAccountGroups,
  resolveCanonicalAccountId,
  type AccountCategory,
  type AccountPurpose,
  type AccountValuationCandidate,
  type ExternalAccountLifecycle,
} from "@monii/accounts";
import {
  assessExternalAccountIdentity,
  type AccountIdentityEvidence,
  type ExternalAccountTypeSupport,
  type IdentityAccount,
  type NormalizedExternalAccount,
  type NormalizedExternalAccountListing,
  type NormalizedExternalConnection,
  type SynchronizationFailure,
  type FinancialOperationalReport,
  type SynchronizationRepository,
} from "@monii/ingestion";
import {
  calculateWealthSnapshot,
  type AccountInclusionPolicy,
  type AccountWealthCalculationState,
  type CalculatedWealthSnapshot,
  type SnapshotAccountDecision,
  type WealthCalculationRepository,
  type WealthSnapshotReason,
} from "@monii/wealth-calculation";
import type {
  CurrentWealthState,
  LatestSynchronizationStatus,
  StoredWealthSnapshot,
  WealthQueryRepository,
} from "@monii/wealth-query";
import { and, asc, desc, eq, inArray, lt, ne, sql } from "drizzle-orm";

import { getDatabase, type Database, type DatabaseTransaction } from "../client";
import {
  accountIdentityClaims,
  accountMatchAssessments,
  connections,
  externalAccountObservations,
  externalAccounts,
  externalInstitutions,
  reportedAccountValuations,
  sourceInstances,
  synchronizationAccountResults,
  synchronizationConnectionResults,
  synchronizationRuns,
} from "../schema/ingestion";
import {
  accountMerges,
  accounts,
  accountValuationCandidates,
  institutions,
} from "../schema/financial";
import {
  accountPolicies,
  snapshotAccountDecisions,
  snapshots,
} from "../schema/wealth";

type Db = Database | DatabaseTransaction;

export type FinancialRepository = SynchronizationRepository &
  WealthCalculationRepository &
  WealthQueryRepository;

export type FinancialRepositoryReporter = Readonly<{
  report(record: FinancialOperationalReport): void;
}>;

type RepositoryEvent = FinancialOperationalReport;

function emitRepositoryEvents(
  reporter: FinancialRepositoryReporter | undefined,
  events: readonly RepositoryEvent[],
) {
  for (const event of events) reporter?.report(event);
}

function withTransaction<T>(
  db: Db,
  callback: (transaction: DatabaseTransaction) => Promise<T>,
) {
  return "transaction" in db
    ? db.transaction(callback)
    : callback(db as DatabaseTransaction);
}

async function sourceInstanceIdForRun(db: Db, runId: string) {
  const [run] = await db
    .select({ sourceInstanceId: synchronizationRuns.sourceInstanceId })
    .from(synchronizationRuns)
    .where(eq(synchronizationRuns.id, runId))
    .limit(1);
  if (!run) throw new Error(`Synchronization run ${runId} does not exist`);
  return run.sourceInstanceId;
}

async function ensureConnection(
  db: DatabaseTransaction,
  runId: string,
  connection: NormalizedExternalConnection,
) {
  const sourceInstanceId = await sourceInstanceIdForRun(db, runId);
  let [externalInstitution] = await db
    .select({
      id: externalInstitutions.id,
      institutionId: externalInstitutions.institutionId,
    })
    .from(externalInstitutions)
    .where(
      and(
        eq(externalInstitutions.sourceInstanceId, sourceInstanceId),
        eq(externalInstitutions.externalId, connection.institution.externalId),
      ),
    )
    .limit(1);

  if (!externalInstitution) {
    const [institution] = await db
      .insert(institutions)
      .values({ name: connection.institution.reportedName })
      .returning({ id: institutions.id });
    if (!institution) throw new Error("Failed to create institution");
    [externalInstitution] = await db
      .insert(externalInstitutions)
      .values({
        externalId: connection.institution.externalId,
        institutionId: institution.id,
        reportedName: connection.institution.reportedName,
        sourceInstanceId,
      })
      .returning({
        id: externalInstitutions.id,
        institutionId: externalInstitutions.institutionId,
      });
  } else {
    // Provider labels are observations. They must not silently replace the
    // user-owned canonical institution name.
    await db
      .update(externalInstitutions)
      .set({
        lastObservedAt: new Date(),
        reportedName: connection.institution.reportedName,
      })
      .where(eq(externalInstitutions.id, externalInstitution.id));
  }
  if (!externalInstitution) throw new Error("Failed to create external institution");

  let [storedConnection] = await db
    .select({ id: connections.id })
    .from(connections)
    .where(
      and(
        eq(connections.sourceInstanceId, sourceInstanceId),
        eq(connections.externalId, connection.externalId),
      ),
    )
    .limit(1);
  if (!storedConnection) {
    [storedConnection] = await db
      .insert(connections)
      .values({
        externalId: connection.externalId,
        externalInstitutionId: externalInstitution.id,
        sourceInstanceId,
      })
      .returning({ id: connections.id });
  } else {
    await db
      .update(connections)
      .set({
        archivedAt: null,
        externalInstitutionId: externalInstitution.id,
        updatedAt: new Date(),
      })
      .where(eq(connections.id, storedConnection.id));
  }
  if (!storedConnection) throw new Error("Failed to create connection");
  return {
    connectionId: storedConnection.id,
    institutionId: externalInstitution.institutionId,
    sourceInstanceId,
  };
}

async function saveIdentityClaims(
  db: DatabaseTransaction,
  runId: string,
  externalAccountId: string,
  evidence: AccountIdentityEvidence,
) {
  const claims = [
    ["iban", evidence.ibanFingerprint],
    ["account_number", evidence.accountNumberFingerprint],
    ["reported_name", evidence.reportedNameFingerprint],
  ] as const;

  for (const [claimType, fingerprint] of claims) {
    if (!fingerprint) continue;
    await db
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
    await db
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

async function saveReportedValuation(
  db: DatabaseTransaction,
  input: Readonly<{
    accountId: string;
    amount: string | null;
    currency: string | null;
    externalAccountObservationId: string;
    recordedAt: Date;
    sourceValidAt: Date | null;
    valuationBasis: "balance" | "estimated_value";
  }>,
) {
  if (input.amount === null) return;
  const [candidate] = await db
    .insert(accountValuationCandidates)
    .values({
      accountId: input.accountId,
      amount: input.amount,
      currency: input.currency,
      effectiveAt: input.sourceValidAt,
      recordedAt: input.recordedAt,
      valuationBasis: input.valuationBasis,
      valuationMethod: "reported",
    })
    .returning({ id: accountValuationCandidates.id });
  if (!candidate) throw new Error("Failed to create account valuation candidate");
  await db.insert(reportedAccountValuations).values({
    accountId: input.accountId,
    externalAccountObservationId: input.externalAccountObservationId,
    valuationBasis: input.valuationBasis,
    valuationCandidateId: candidate.id,
  });
}

async function saveSuccessfulAccount(
  db: DatabaseTransaction,
  context: Readonly<{
    connectionId: string;
    institutionId: string;
    runId: string;
    sourceInstanceId: string;
  }>,
  account: NormalizedExternalAccount,
  events: RepositoryEvent[],
) {
  let persistenceOutcome: "created" | "updated" = "updated";
  let classificationChanged = false;
  let lifecycleChanged = false;
  let [externalAccount] = await db
    .select({
      accountId: externalAccounts.accountId,
      id: externalAccounts.id,
      lifecycle: externalAccounts.lifecycle,
    })
    .from(externalAccounts)
    .where(
      and(
        eq(externalAccounts.sourceInstanceId, context.sourceInstanceId),
        eq(externalAccounts.externalId, account.externalId),
      ),
    )
    .limit(1);

  if (!externalAccount) {
    persistenceOutcome = "created";
    const [createdAccount] = await db
      .insert(accounts)
      .values({
        category: account.category,
        institutionId: context.institutionId,
        managementMode: "external",
        name: account.reportedName,
        purpose: account.purpose,
      })
      .returning({ id: accounts.id });
    if (!createdAccount) throw new Error("Failed to create canonical account");
    await db.insert(accountPolicies).values({ accountId: createdAccount.id });
    [externalAccount] = await db
      .insert(externalAccounts)
      .values({
        accountId: createdAccount.id,
        connectionId: context.connectionId,
        externalId: account.externalId,
        lifecycle: account.lifecycle,
        lifecycleChangedAt: new Date(),
        normalizedTypeSupport: account.typeSupport,
        reportedName: account.reportedName,
        reportedType: account.reportedType,
        sourceInstanceId: context.sourceInstanceId,
      })
      .returning({
        accountId: externalAccounts.accountId,
        id: externalAccounts.id,
        lifecycle: externalAccounts.lifecycle,
      });
  } else {
    lifecycleChanged = externalAccount.lifecycle !== account.lifecycle;
    await db
      .update(externalAccounts)
      .set({
        connectionId: context.connectionId,
        lastObservedAt: new Date(),
        lifecycle: account.lifecycle,
        ...(externalAccount.lifecycle === account.lifecycle
          ? {}
          : { lifecycleChangedAt: new Date() }),
        normalizedTypeSupport: account.typeSupport,
        reportedName: account.reportedName,
        reportedType: account.reportedType,
      })
      .where(eq(externalAccounts.id, externalAccount.id));
    // Classification may become more precise as adapter support grows. Names
    // remain canonical and are never refreshed from provider observations.
    const [canonicalAccount] = await db
      .select({ category: accounts.category, purpose: accounts.purpose })
      .from(accounts)
      .where(eq(accounts.id, externalAccount.accountId))
      .limit(1);
    if (!canonicalAccount) throw new Error("Canonical account does not exist");
    const category =
      canonicalAccount.category === "unknown" && account.category !== "unknown"
        ? account.category
        : canonicalAccount.category;
    const purpose =
      canonicalAccount.purpose === "unknown" && account.purpose !== "unknown"
        ? account.purpose
        : canonicalAccount.purpose;
    if (
      category !== canonicalAccount.category ||
      purpose !== canonicalAccount.purpose
    ) {
      classificationChanged = true;
      await db
        .update(accounts)
        .set({ category, purpose, updatedAt: new Date() })
        .where(eq(accounts.id, externalAccount.accountId));
    }
  }
  if (!externalAccount) throw new Error("Failed to create external account");

  const recordedAt = new Date();
  const [observation] = await db
    .insert(externalAccountObservations)
    .values({
      accountId: externalAccount.accountId,
      externalAccountId: externalAccount.id,
      observedAt: recordedAt,
      reportedCurrency: account.rawCurrency,
      reportedLifecycle: account.lifecycle,
      sourceInstanceId: context.sourceInstanceId,
      sourceValidAt: account.sourceValidAt,
      synchronizationRunId: context.runId,
    })
    .returning({ id: externalAccountObservations.id });
  if (!observation) throw new Error("Failed to create external account observation");

  await saveReportedValuation(db, {
    accountId: externalAccount.accountId,
    amount: account.balance,
    currency: account.currency,
    externalAccountObservationId: observation.id,
    recordedAt,
    sourceValidAt: account.sourceValidAt,
    valuationBasis: "balance",
  });
  await saveReportedValuation(db, {
    accountId: externalAccount.accountId,
    amount: account.estimatedValue,
    currency: account.currency,
    externalAccountObservationId: observation.id,
    recordedAt,
    sourceValidAt: account.sourceValidAt,
    valuationBasis: "estimated_value",
  });
  await db.insert(synchronizationAccountResults).values({
    externalAccountId: externalAccount.id,
    externalAccountObservationId: observation.id,
    sourceInstanceId: context.sourceInstanceId,
    status: "succeeded",
    synchronizationRunId: context.runId,
  });
  await saveIdentityClaims(db, context.runId, externalAccount.id, account.identity);
  if (persistenceOutcome === "created" || classificationChanged || lifecycleChanged) {
    events.push({
    event:
      persistenceOutcome === "created"
        ? "ingestion.account.created"
        : "ingestion.account.changed",
    fields: {
      account_id: externalAccount.accountId,
      balance_amount: account.balance,
      category: account.category,
      classification_changed: classificationChanged,
      currency: account.currency,
      estimated_value_amount: account.estimatedValue,
      lifecycle: account.lifecycle,
      lifecycle_changed: lifecycleChanged,
      outcome: persistenceOutcome,
      provider_account_id: account.externalId,
      purpose: account.purpose,
      run_id: context.runId,
      type_support: account.typeSupport,
    },
    level: account.typeSupport === "unrecognized" ? "warn" : "info",
    message: persistenceOutcome === "created"
      ? "External financial account created"
      : "External financial account classification or lifecycle changed",
    });
  }
  return externalAccount.id;
}

async function saveKnownAccountFailure(
  db: DatabaseTransaction,
  input: Readonly<{
    externalId: string;
    failure: SynchronizationFailure;
    runId: string;
    sourceInstanceId: string;
  }>,
) {
  const [externalAccount] = await db
    .select({ id: externalAccounts.id })
    .from(externalAccounts)
    .where(
      and(
        eq(externalAccounts.sourceInstanceId, input.sourceInstanceId),
        eq(externalAccounts.externalId, input.externalId),
      ),
    )
    .limit(1);
  if (!externalAccount) return false;
  await db.insert(synchronizationAccountResults).values({
    errorCode: input.failure.code,
    errorKind: input.failure.kind,
    externalAccountId: externalAccount.id,
    sourceInstanceId: input.sourceInstanceId,
    status: input.failure.kind === "malformed" ? "malformed" : "provider_error",
    synchronizationRunId: input.runId,
  });
  return true;
}

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

async function reconcileAccountIdentities(
  db: DatabaseTransaction,
  runId: string,
): Promise<readonly RepositoryEvent[]> {
  const events: RepositoryEvent[] = [];
  const referenceRows = await db
    .select({
      accountCreatedAt: accounts.createdAt,
      accountId: externalAccounts.accountId,
      category: accounts.category,
      currency: accountValuationCandidates.currency,
      externalAccountId: externalAccounts.id,
      institutionId: accounts.institutionId,
      recordedAt: accountValuationCandidates.recordedAt,
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
  const firstByExternalAccount = new Map<string, (typeof referenceRows)[number]>();
  for (const row of referenceRows) {
    if (!firstByExternalAccount.has(row.externalAccountId)) {
      firstByExternalAccount.set(row.externalAccountId, row);
    }
  }
  const claims = await db
    .select()
    .from(accountIdentityClaims)
    .where(eq(accountIdentityClaims.isCurrent, true))
    .orderBy(desc(accountIdentityClaims.updatedAt));
  const claimsByExternalAccount = new Map<string, typeof claims>();
  for (const claim of claims) {
    claimsByExternalAccount.set(claim.externalAccountId, [
      ...(claimsByExternalAccount.get(claim.externalAccountId) ?? []),
      claim,
    ]);
  }
  const identityAccounts: IdentityAccount[] = [];
  for (const row of firstByExternalAccount.values()) {
    const evidence = identityEvidence(
      claimsByExternalAccount.get(row.externalAccountId) ?? [],
    );
    if (!evidence) continue;
    identityAccounts.push({
      accountId: row.accountId,
      category: row.category as AccountCategory,
      currency: row.currency,
      evidence,
      externalAccountId: row.externalAccountId,
      institutionId: row.institutionId,
    });
  }

  const previousActiveLikelyMatches = await db
    .select({
      leftExternalAccountId: accountMatchAssessments.leftExternalAccountId,
      rightExternalAccountId: accountMatchAssessments.rightExternalAccountId,
    })
    .from(accountMatchAssessments)
    .where(
      and(
        eq(accountMatchAssessments.classification, "likely_duplicate"),
        eq(accountMatchAssessments.isActive, true),
      ),
    );
  const activeLikelyPairKeys = new Set<string>();
  const identityByExternalAccount = new Map(
    identityAccounts.map((account) => [account.externalAccountId, account]),
  );

  await db
    .update(accountMatchAssessments)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(accountMatchAssessments.classification, "likely_duplicate"));

  for (let leftIndex = 0; leftIndex < identityAccounts.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < identityAccounts.length;
      rightIndex += 1
    ) {
      const left = identityAccounts[leftIndex]!;
      const right = identityAccounts[rightIndex]!;
      const assessment = assessExternalAccountIdentity(left, right);
      const classification = assessment.classification;
      const [leftExternalAccountId, rightExternalAccountId] =
        left.externalAccountId < right.externalAccountId
          ? [left.externalAccountId, right.externalAccountId]
          : [right.externalAccountId, left.externalAccountId];
      const [existing] = await db
        .select()
        .from(accountMatchAssessments)
        .where(
          and(
            eq(accountMatchAssessments.leftExternalAccountId, leftExternalAccountId),
            eq(accountMatchAssessments.rightExternalAccountId, rightExternalAccountId),
          ),
        )
        .limit(1);
      const pairKey = `${leftExternalAccountId}:${rightExternalAccountId}`;
      if (classification === "likely_duplicate") {
        activeLikelyPairKeys.add(pairKey);
      }
      if (
        classification !== "distinct" &&
        existing?.classification !== classification
      ) {
        events.push({
          event: "ingestion.identity_match.changed",
          fields: {
            classification,
            left_account_id: left.accountId,
            left_external_account_id: leftExternalAccountId,
            previous_classification: existing?.classification ?? null,
            reason_codes: assessment.reasonCodes,
            right_account_id: right.accountId,
            right_external_account_id: rightExternalAccountId,
            run_id: runId,
          },
          level: classification === "likely_duplicate" ? "warn" : "info",
          message:
            classification === "confirmed_duplicate"
              ? "External account pair confirmed as the same financial account"
              : "External account pair now requires duplicate review",
        });
      }
      if (classification === "distinct") {
        if (existing?.classification === "confirmed_duplicate") {
          await db
            .update(accountMatchAssessments)
            .set({ conflictDetectedAt: new Date(), updatedAt: new Date() })
            .where(eq(accountMatchAssessments.id, existing.id));
          events.push({
            event: "ingestion.identity.conflict_detected",
            fields: {
              left_account_id: left.accountId,
              left_external_account_id: leftExternalAccountId,
              reason_codes: assessment.reasonCodes,
              right_account_id: right.accountId,
              right_external_account_id: rightExternalAccountId,
              run_id: runId,
            },
            level: "warn",
            message: "Current identity evidence conflicts with a confirmed account match",
          });
        }
        continue;
      }
      const durableClassification =
        existing?.classification === "confirmed_duplicate"
          ? "confirmed_duplicate"
          : classification;
      await db
        .insert(accountMatchAssessments)
        .values({
          classification: durableClassification,
          evidence:
            durableClassification === "confirmed_duplicate"
              ? "institution_iban_currency_category"
              : "institution_currency_category_reported_name",
          firstDetectedRunId: runId,
          isActive: true,
          lastDetectedRunId: runId,
          leftExternalAccountId,
          rightExternalAccountId,
        })
        .onConflictDoUpdate({
          target: [
            accountMatchAssessments.leftExternalAccountId,
            accountMatchAssessments.rightExternalAccountId,
          ],
          set: {
            classification: durableClassification,
            isActive: true,
            lastDetectedRunId: runId,
            updatedAt: new Date(),
          },
        });
    }
  }

  for (const previous of previousActiveLikelyMatches) {
    const pairKey = `${previous.leftExternalAccountId}:${previous.rightExternalAccountId}`;
    if (activeLikelyPairKeys.has(pairKey)) continue;
    events.push({
      event: "ingestion.likely_duplicate.cleared",
      fields: {
        left_account_id: identityByExternalAccount.get(previous.leftExternalAccountId)
          ?.accountId ?? null,
        left_external_account_id: previous.leftExternalAccountId,
        right_account_id: identityByExternalAccount.get(previous.rightExternalAccountId)
          ?.accountId ?? null,
        right_external_account_id: previous.rightExternalAccountId,
        run_id: runId,
      },
      level: "warn",
      message: "Previously likely duplicate account pair is no longer an active match",
    });
  }

  const confirmed = await db
    .select({
      leftAccountId: externalAccounts.accountId,
      rightExternalAccountId: accountMatchAssessments.rightExternalAccountId,
    })
    .from(accountMatchAssessments)
    .innerJoin(
      externalAccounts,
      eq(externalAccounts.id, accountMatchAssessments.leftExternalAccountId),
    )
    .where(eq(accountMatchAssessments.classification, "confirmed_duplicate"));
  const rightIds = confirmed.map((match) => match.rightExternalAccountId);
  const rightRows = rightIds.length
    ? await db
        .select({ accountId: externalAccounts.accountId, id: externalAccounts.id })
        .from(externalAccounts)
        .where(inArray(externalAccounts.id, rightIds))
    : [];
  const rightById = new Map(rightRows.map((row) => [row.id, row.accountId]));
  const pairs = confirmed.flatMap((match) => {
    const rightAccountId = rightById.get(match.rightExternalAccountId);
    return rightAccountId
      ? [{ leftAccountId: match.leftAccountId, rightAccountId }]
      : [];
  });
  const allMerges = await db.select().from(accountMerges);
  const resolvedPairs = pairs.map((pair) => ({
    leftAccountId: resolveCanonicalAccountId(pair.leftAccountId, allMerges),
    rightAccountId: resolveCanonicalAccountId(pair.rightAccountId, allMerges),
  }));
  const accountIds = [
    ...new Set(
      resolvedPairs.flatMap((pair) => [pair.leftAccountId, pair.rightAccountId]),
    ),
  ];
  for (const group of connectedAccountGroups(accountIds, resolvedPairs)) {
    const groupAccounts = await db
      .select({
        createdAt: accounts.createdAt,
        id: accounts.id,
        inclusionPolicy: accountPolicies.inclusionPolicy,
        purpose: accounts.purpose,
      })
      .from(accounts)
      .leftJoin(accountPolicies, eq(accounts.id, accountPolicies.accountId))
      .where(inArray(accounts.id, group))
      .orderBy(asc(accounts.createdAt), asc(accounts.id));
    const canonical = groupAccounts[0];
    if (!canonical) continue;
    const mergedIds = groupAccounts
      .filter((account) => account.id !== canonical.id)
      .map((account) => account.id);
    if (!mergedIds.length) continue;
    const inclusionPolicy = groupAccounts.some(
      (account) => account.inclusionPolicy === "exclude",
    )
      ? "exclude"
      : groupAccounts.some((account) => account.inclusionPolicy === "include")
        ? "include"
        : "automatic";
    const purpose = groupAccounts.some((account) => account.purpose === "business")
      ? "business"
      : groupAccounts.some((account) => account.purpose === "personal")
        ? "personal"
        : "unknown";
    await db
      .update(accountPolicies)
      .set({ inclusionPolicy, updatedAt: new Date() })
      .where(eq(accountPolicies.accountId, canonical.id));
    await db
      .update(accounts)
      .set({ purpose, updatedAt: new Date() })
      .where(eq(accounts.id, canonical.id));
    await db
      .insert(accountMerges)
      .values(
        mergedIds.map((mergedAccountId) => ({
          canonicalAccountId: canonical.id,
          mergedAccountId,
          reason: "confirmed_external_identity",
        })),
      )
      .onConflictDoNothing();
    events.push({
      event: "accounts.merge.completed",
      fields: {
        canonical_account_id: canonical.id,
        canonical_selection_rule: "oldest_created_at_then_account_id",
        inclusion_policy: inclusionPolicy,
        merged_account_count: mergedIds.length,
        merged_account_ids: mergedIds,
        purpose,
        run_id: runId,
      },
      level: "info",
      message: "Confirmed duplicate accounts merged into a canonical account",
    });
  }
  return events;
}

function laterCandidate(
  left: AccountValuationCandidate | null,
  right: AccountValuationCandidate,
) {
  if (!left) return right;
  const leftEffective = (left.effectiveAt ?? left.recordedAt).getTime();
  const rightEffective = (right.effectiveAt ?? right.recordedAt).getTime();
  return rightEffective > leftEffective ||
    (rightEffective === leftEffective &&
      right.recordedAt.getTime() > left.recordedAt.getTime())
    ? right
    : left;
}

const incompleteWealthDecisions = new Set([
  "missing_currency",
  "missing_selected_valuation",
  "unknown_account_category",
  "unsupported_currency",
]);

function wealthSnapshotReports(
  calculated: CalculatedWealthSnapshot,
  input: Readonly<{
    reason: WealthSnapshotReason;
    synchronizationRunId?: string;
  }>,
  snapshotId: string,
): readonly RepositoryEvent[] {
  const events: RepositoryEvent[] = calculated.decisions.flatMap((decision) => {
    const uncertain = incompleteWealthDecisions.has(decision.decision) ||
      decision.identityConflict || decision.refreshUncertain;
    if (!uncertain) return [];
    return [{
      event: "wealth.account.evaluated",
      fields: {
        account_category: decision.accountCategory,
        account_id: decision.accountId,
        account_management_mode: decision.accountManagementMode,
        account_purpose: decision.accountPurpose,
        contributed_amount: decision.contributedAmount,
        decision: decision.decision,
        duplicate_adjusted_amount: decision.duplicateAdjustedAmount,
        duplicate_group_id: decision.duplicateGroupId,
        duplicate_role: decision.duplicateRole,
        evaluated_amount: decision.evaluatedAmount,
        evaluated_currency: decision.evaluatedCurrency,
        identity_conflict: decision.identityConflict,
        inclusion_policy: decision.inclusionPolicy,
        refresh_uncertain: decision.refreshUncertain,
        selected_valuation_basis: decision.selectedValuationBasis,
        selected_valuation_method: decision.selectedValuationMethod,
        snapshot_id: snapshotId,
        valuation_candidate_id: decision.evaluatedValuationCandidateId,
      },
      level: "warn" as const,
      message: "Financial account requires attention after wealth evaluation",
    }];
  });

  const decisionsByDuplicateGroup = new Map<string, SnapshotAccountDecision[]>();
  for (const decision of calculated.decisions) {
    if (!decision.duplicateGroupId || decision.duplicateRole === "none") continue;
    decisionsByDuplicateGroup.set(decision.duplicateGroupId, [
      ...(decisionsByDuplicateGroup.get(decision.duplicateGroupId) ?? []),
      decision,
    ]);
  }
  for (const [groupId, decisions] of decisionsByDuplicateGroup) {
    const representative = decisions.find(
      (decision) => decision.duplicateRole === "representative",
    );
    events.push({
      event: "wealth.duplicate_group.adjusted",
      fields: {
        duplicate_group_id: groupId,
        excluded_account_ids: decisions
          .filter(
            (decision) =>
              decision.duplicateRole === "excluded_from_adjusted_estimate",
          )
          .map((decision) => decision.accountId),
        representative_account_id: representative?.accountId ?? null,
        representative_amount: representative?.duplicateAdjustedAmount ?? null,
        representative_currency: representative?.evaluatedCurrency ?? null,
        selection_rule:
          "latest_effective_at_then_recorded_at_then_lexicographic_account_id",
        snapshot_id: snapshotId,
      },
      level: "warn",
      message: "Likely duplicate group adjusted to one representative account",
    });
  }

  events.push({
    event: "wealth.snapshot.created",
    fields: {
      contributing_account_count: calculated.contributingAccountCount,
      duplicate_adjusted_estimate_amount:
        calculated.duplicateAdjustedEstimateAmount,
      headline_amount: calculated.headlineAmount,
      is_complete: calculated.isComplete,
      likely_duplicate_group_count: calculated.likelyDuplicateGroupCount,
      missing_account_count: calculated.missingAccountCount,
      reason: input.reason,
      reporting_currency: "EUR",
      snapshot_id: snapshotId,
      synchronization_run_id: input.synchronizationRunId ?? null,
    },
    level: calculated.isComplete ? "info" : "warn",
    message: calculated.isComplete
      ? "Wealth snapshot created"
      : "Incomplete wealth snapshot created",
  });
  return events;
}

async function loadAccountCalculationStates(
  db: Db,
): Promise<readonly AccountWealthCalculationState[]> {
  const accountRows = await db
    .select({
      account: accounts,
      institutionName: institutions.name,
      policy: accountPolicies,
    })
    .from(accounts)
    .leftJoin(institutions, eq(accounts.institutionId, institutions.id))
    .leftJoin(accountPolicies, eq(accounts.id, accountPolicies.accountId));
  const merges = await db.select().from(accountMerges);
  const groupedIds = new Map<string, string[]>();
  for (const row of accountRows) {
    const root = resolveCanonicalAccountId(row.account.id, merges);
    groupedIds.set(root, [...(groupedIds.get(root) ?? []), row.account.id]);
  }
  const externalRows = await db.select().from(externalAccounts);
  const rankedValuations = db
    .select({
      accountId: accountValuationCandidates.accountId,
      amount: accountValuationCandidates.amount,
      candidateRank: sql<number>`row_number() over (
        partition by ${accountValuationCandidates.accountId}, ${accountValuationCandidates.valuationBasis}
        order by coalesce(${accountValuationCandidates.effectiveAt}, ${accountValuationCandidates.recordedAt}) desc,
          ${accountValuationCandidates.recordedAt} desc,
          ${accountValuationCandidates.id} desc
      )`.as("candidate_rank"),
      currency: accountValuationCandidates.currency,
      effectiveAt: accountValuationCandidates.effectiveAt,
      id: accountValuationCandidates.id,
      recordedAt: accountValuationCandidates.recordedAt,
      valuationBasis: accountValuationCandidates.valuationBasis,
    })
    .from(accountValuationCandidates)
    .as("ranked_account_valuations");
  const valuationRows = await db
    .select()
    .from(rankedValuations)
    .where(eq(rankedValuations.candidateRank, 1));
  const resultRows = await db
    .select({
      result: synchronizationAccountResults,
      runStartedAt: synchronizationRuns.startedAt,
    })
    .from(synchronizationAccountResults)
    .innerJoin(
      synchronizationRuns,
      eq(synchronizationRuns.id, synchronizationAccountResults.synchronizationRunId),
    )
    .orderBy(desc(synchronizationRuns.startedAt), desc(synchronizationAccountResults.finishedAt));
  const matchRows = await db
    .select()
    .from(accountMatchAssessments)
    .where(eq(accountMatchAssessments.isActive, true));
  const accountByExternal = new Map(
    externalRows.map((external) => [external.id, external.accountId]),
  );
  const likelyPairs = matchRows.flatMap((match) => {
    if (match.classification !== "likely_duplicate") return [];
    const left = accountByExternal.get(match.leftExternalAccountId);
    const right = accountByExternal.get(match.rightExternalAccountId);
    if (!left || !right) return [];
    const leftRoot = resolveCanonicalAccountId(left, merges);
    const rightRoot = resolveCanonicalAccountId(right, merges);
    return leftRoot === rightRoot
      ? []
      : [{ leftAccountId: leftRoot, rightAccountId: rightRoot }];
  });
  const rootIds = [
    ...new Set(accountRows.map((row) => resolveCanonicalAccountId(row.account.id, merges))),
  ];
  const likelyGroupByAccount = new Map<string, string>();
  for (const group of connectedAccountGroups(rootIds, likelyPairs)) {
    const groupId = [...group].sort()[0]!;
    for (const accountId of group) likelyGroupByAccount.set(accountId, groupId);
  }
  const conflictAccounts = new Set<string>();
  for (const match of matchRows) {
    if (!match.conflictDetectedAt) continue;
    const left = accountByExternal.get(match.leftExternalAccountId);
    const right = accountByExternal.get(match.rightExternalAccountId);
    if (left) conflictAccounts.add(resolveCanonicalAccountId(left, merges));
    if (right) conflictAccounts.add(resolveCanonicalAccountId(right, merges));
  }

  return accountRows.map((row): AccountWealthCalculationState => {
    const root = resolveCanonicalAccountId(row.account.id, merges);
    const memberIds = groupedIds.get(root) ?? [row.account.id];
    const groupExternal = externalRows.filter((external) =>
      memberIds.includes(external.accountId),
    );
    let balance: AccountValuationCandidate | null = null;
    let estimatedValue: AccountValuationCandidate | null = null;
    let latestDataRecordedAt: Date | null = null;
    for (const candidate of valuationRows) {
      if (!memberIds.includes(candidate.accountId)) continue;
      const normalized: AccountValuationCandidate = {
        accountId: candidate.accountId,
        amount: candidate.amount,
        currency: candidate.currency,
        effectiveAt: candidate.effectiveAt,
        recordedAt: candidate.recordedAt,
        basis: candidate.valuationBasis as "balance" | "estimated_value",
        valuationCandidateId: candidate.id,
        valuationMethod: "reported",
      };
      if (candidate.valuationBasis === "balance") {
        balance = laterCandidate(balance, normalized);
      } else {
        estimatedValue = laterCandidate(estimatedValue, normalized);
      }
      if (!latestDataRecordedAt || candidate.recordedAt > latestDataRecordedAt) {
        latestDataRecordedAt = candidate.recordedAt;
      }
    }
    const support: ExternalAccountTypeSupport = groupExternal.some(
      (external) => external.normalizedTypeSupport === "supported",
    )
      ? "supported"
      : groupExternal.some(
            (external) => external.normalizedTypeSupport === "unrecognized",
          )
        ? "unrecognized"
        : "known_unsupported";
    const lifecycle = groupExternal.some((external) => external.lifecycle === "active")
      ? "active"
      : (groupExternal[0]?.lifecycle ?? "unknown");
    const externalIds = new Set(groupExternal.map((external) => external.id));
    const latestResult = resultRows.find(({ result }) =>
      externalIds.has(result.externalAccountId),
    )?.result;
    return {
      accountId: row.account.id,
      accountName: row.account.name,
      archivedAt: row.account.archivedAt,
      balance,
      category: row.account.category as AccountCategory,
      estimatedValue,
      externalLifecycle: lifecycle as ExternalAccountLifecycle,
      identityConflict: conflictAccounts.has(root),
      inclusionPolicy: (row.policy?.inclusionPolicy ?? "automatic") as AccountInclusionPolicy,
      institutionId: row.account.institutionId,
      institutionName: row.institutionName,
      latestDataRecordedAt,
      likelyDuplicateGroupId: likelyGroupByAccount.get(root) ?? null,
      managementMode: "external",
      mergedIntoAccountId: root === row.account.id ? null : root,
      purpose: row.account.purpose as AccountPurpose,
      refreshUncertain: Boolean(latestResult && latestResult.status !== "succeeded"),
      selectedValuationMethod: "reported",
      typeSupport: support,
    };
  });
}

async function saveWealthSnapshot(
  db: DatabaseTransaction,
  input: Readonly<{
    actionId: string;
    causationId: string;
    reason: WealthSnapshotReason;
    synchronizationRunId?: string;
  }>,
) {
  const policyCalculation = calculateWealthSnapshot(
    await loadAccountCalculationStates(db),
  );
  const [latestRun] = await db
    .select({ status: synchronizationRuns.status })
    .from(synchronizationRuns)
    .orderBy(desc(synchronizationRuns.startedAt))
    .limit(1);
  const calculated: CalculatedWealthSnapshot = {
    ...policyCalculation,
    isComplete:
      policyCalculation.isComplete &&
      (latestRun === undefined || latestRun.status === "succeeded"),
  };
  const [snapshot] = await db
    .insert(snapshots)
    .values({
      actionId: input.actionId,
      causationId: input.causationId,
      contributingAccountCount: calculated.contributingAccountCount,
      duplicateAdjustedEstimateAmount: calculated.duplicateAdjustedEstimateAmount,
      headlineAmount: calculated.headlineAmount,
      isComplete: calculated.isComplete,
      likelyDuplicateGroupCount: calculated.likelyDuplicateGroupCount,
      missingAccountCount: calculated.missingAccountCount,
      reason: input.reason,
      recordedAt: sql`clock_timestamp()`,
      synchronizationRunId: input.synchronizationRunId,
    })
    .returning({ id: snapshots.id });
  if (!snapshot) throw new Error("Failed to create wealth snapshot");
  if (calculated.decisions.length) {
    await db.insert(snapshotAccountDecisions).values(
      calculated.decisions.map((decision: SnapshotAccountDecision) => ({
        accountCategory: decision.accountCategory,
        accountId: decision.accountId,
        accountManagementMode: decision.accountManagementMode,
        accountName: decision.accountName,
        accountPurpose: decision.accountPurpose,
        contributedAmount: decision.contributedAmount,
        decision: decision.decision,
        duplicateAdjustedAmount: decision.duplicateAdjustedAmount,
        duplicateGroupId: decision.duplicateGroupId,
        duplicateRole: decision.duplicateRole,
        evaluatedAmount: decision.evaluatedAmount,
        evaluatedCurrency: decision.evaluatedCurrency,
        evaluatedValuationCandidateId: decision.evaluatedValuationCandidateId,
        identityConflict: decision.identityConflict,
        inclusionPolicy: decision.inclusionPolicy,
        institutionId: decision.institutionId,
        institutionName: decision.institutionName,
        latestDataRecordedAt: decision.latestDataRecordedAt,
        refreshUncertain: decision.refreshUncertain,
        selectedValuationBasis: decision.selectedValuationBasis,
        selectedValuationEffectiveAt: decision.selectedValuationEffectiveAt,
        selectedValuationMethod: decision.selectedValuationMethod,
        selectedValuationRecordedAt: decision.selectedValuationRecordedAt,
        snapshotId: snapshot.id,
      })),
    );
  }
  return {
    events: wealthSnapshotReports(calculated, input, snapshot.id),
    snapshotId: snapshot.id,
  };
}

async function loadCurrentWealthState(db: Db): Promise<CurrentWealthState> {
  const [snapshot] = await db
    .select()
    .from(snapshots)
    .orderBy(desc(snapshots.recordedAt), desc(snapshots.id))
    .limit(1);
  const [latestRun] = await db
    .select()
    .from(synchronizationRuns)
    .orderBy(desc(synchronizationRuns.startedAt))
    .limit(1);
  const [lastSuccessfulRun] = await db
    .select({ finishedAt: synchronizationRuns.finishedAt })
    .from(synchronizationRuns)
    .where(eq(synchronizationRuns.status, "succeeded"))
    .orderBy(desc(synchronizationRuns.finishedAt))
    .limit(1);
  if (!snapshot) {
    return {
      lastSuccessfulSynchronizationAt: lastSuccessfulRun?.finishedAt ?? null,
      latestSynchronizationStatus:
        (latestRun?.status as LatestSynchronizationStatus | undefined) ?? null,
      snapshot: null,
    };
  }
  const decisions = await db
    .select()
    .from(snapshotAccountDecisions)
    .where(eq(snapshotAccountDecisions.snapshotId, snapshot.id));
  const stored: StoredWealthSnapshot = {
    accounts: decisions.map((decision) => ({
      accountId: decision.accountId,
      accountName: decision.accountName,
      adjustedAmount: decision.duplicateAdjustedAmount,
      category: decision.accountCategory as AccountCategory,
      contributedAmount: decision.contributedAmount,
      decision: decision.decision as StoredWealthSnapshot["accounts"][number]["decision"],
      duplicateRole:
        decision.duplicateRole as StoredWealthSnapshot["accounts"][number]["duplicateRole"],
      evaluatedAmount: decision.evaluatedAmount,
      evaluatedCurrency: decision.evaluatedCurrency,
      identityConflict: decision.identityConflict,
      institutionId: decision.institutionId,
      institutionName: decision.institutionName,
      refreshUncertain: decision.refreshUncertain,
      valuationEffectiveAt: decision.selectedValuationEffectiveAt,
      valuationRecordedAt: decision.selectedValuationRecordedAt,
    })),
    duplicateAdjustedEstimateAmount: snapshot.duplicateAdjustedEstimateAmount,
    headlineAmount: snapshot.headlineAmount,
    isComplete: snapshot.isComplete,
    likelyDuplicateGroupCount: snapshot.likelyDuplicateGroupCount,
    recordedAt: snapshot.recordedAt,
    snapshotId: snapshot.id,
  };
  return {
    lastSuccessfulSynchronizationAt: lastSuccessfulRun?.finishedAt ?? null,
    latestSynchronizationStatus:
      (latestRun?.status as LatestSynchronizationStatus | undefined) ?? null,
    snapshot: stored,
  };
}

function isUniqueViolation(error: unknown) {
  let candidate = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof candidate !== "object" || candidate === null) return false;
    if ("code" in candidate && (candidate as { code?: unknown }).code === "23505") {
      return true;
    }
    candidate = "cause" in candidate ? candidate.cause : null;
  }
  return false;
}

export function createPostgresFinancialPersistence(
  db: Db = getDatabase(),
  reporter?: FinancialRepositoryReporter,
): FinancialRepository {
  return {
    async changeAccountInclusionPolicy(input) {
      const result = await withTransaction(db, async (transaction) => {
        const updated = await transaction
          .update(accountPolicies)
          .set({ inclusionPolicy: input.inclusionPolicy, updatedAt: new Date() })
          .where(
            and(
              eq(accountPolicies.accountId, input.accountId),
              sql`exists (select 1 from ${accounts} where ${accounts.id} = ${input.accountId} and ${accounts.archivedAt} is null)`,
            ),
          )
          .returning({ accountId: accountPolicies.accountId });
        if (!updated.length) {
          return {
            changed: false,
            events: [{
              event: "wealth.account_policy.rejected",
              fields: {
                account_id: input.accountId,
                requested_inclusion_policy: input.inclusionPolicy,
                reason: "account_missing_or_archived",
              },
              level: "warn" as const,
              message: "Account inclusion policy change was rejected",
            }],
          };
        }
        const snapshot = await saveWealthSnapshot(transaction, {
          actionId: input.actionId,
          causationId: randomUUID(),
          reason: "account_policy_changed",
        });
        return {
          changed: true,
          events: [{
            event: "wealth.account_policy.changed",
            fields: {
              account_id: input.accountId,
              inclusion_policy: input.inclusionPolicy,
              snapshot_id: snapshot.snapshotId,
            },
            level: "info" as const,
            message: "Account inclusion policy changed",
          }, ...snapshot.events],
        };
      });
      emitRepositoryEvents(reporter, result.events);
      return result.changed;
    },
    async finalizeRun(runId, status, failure) {
      const finalized = await withTransaction(db, async (transaction) => {
        const [run] = await transaction
          .update(synchronizationRuns)
          .set({
            errorCode: failure?.code ?? null,
            errorKind: failure?.kind ?? null,
            finishedAt: sql`clock_timestamp()`,
            status,
          })
          .where(and(eq(synchronizationRuns.id, runId), eq(synchronizationRuns.status, "running")))
          .returning({ actionId: synchronizationRuns.actionId });
        if (!run) throw new Error(`Synchronization run ${runId} is not running`);
        const events = await reconcileAccountIdentities(transaction, runId);
        const snapshot = await saveWealthSnapshot(transaction, {
          actionId: run.actionId,
          causationId: runId,
          reason: "synchronization",
          synchronizationRunId: runId,
        });
        return { events: [...events, ...snapshot.events] };
      });
      emitRepositoryEvents(reporter, finalized.events);
    },
    async identifyRunSource(runId, externalSubjectId) {
      const sourceInstanceId = await sourceInstanceIdForRun(db, runId);
      const [source] = await db
        .select()
        .from(sourceInstances)
        .where(eq(sourceInstances.id, sourceInstanceId))
        .limit(1);
      if (!source) throw new Error("Synchronization source instance does not exist");
      if (source.externalSubjectId && source.externalSubjectId !== externalSubjectId) {
        throw new Error(
          `Source instance ${source.sourceKey} is configured for a different external subject`,
        );
      }
      await db
        .update(sourceInstances)
        .set({ externalSubjectId, updatedAt: new Date() })
        .where(eq(sourceInstances.id, sourceInstanceId));
    },
    loadCurrentWealthState: () => loadCurrentWealthState(db),
    async markRunFailed(runId, failure) {
      const updated = await db
        .update(synchronizationRuns)
        .set({
          errorCode: failure.code,
          errorKind: failure.kind,
          finishedAt: sql`clock_timestamp()`,
          status: "failed",
        })
        .where(and(eq(synchronizationRuns.id, runId), eq(synchronizationRuns.status, "running")))
        .returning({ runId: synchronizationRuns.id });
      void updated;
    },
    async recordConnectionFailure(runId, connection, failure) {
      const events = await withTransaction(db, async (transaction) => {
        const transactionEvents: RepositoryEvent[] = [];
        const context = await ensureConnection(transaction, runId, connection);
        await transaction.insert(synchronizationConnectionResults).values({
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
        return transactionEvents;
      });
      emitRepositoryEvents(reporter, events);
    },
    async recordConnectionResult(
      runId,
      connection,
      listing: NormalizedExternalAccountListing,
    ) {
      const persisted = await withTransaction(db, async (transaction) => {
        const events: RepositoryEvent[] = [];
        const context = await ensureConnection(transaction, runId, connection);
        const returnedIds = new Set<string>();
        for (const account of listing.accounts) {
          returnedIds.add(account.externalId);
          await saveSuccessfulAccount(
            transaction,
            { ...context, runId },
            account,
            events,
          );
        }
        let failedAccountCount = 0;
        for (const failure of listing.failures) {
          if (failure.externalId) returnedIds.add(failure.externalId);
          if (failure.externalId) {
            const knownAccount = await saveKnownAccountFailure(transaction, {
              externalId: failure.externalId,
              failure: failure.failure,
              runId,
              sourceInstanceId: context.sourceInstanceId,
            });
            events.push({
              event: "ingestion.account.persistence_failed",
              fields: {
                error_code: failure.failure.code,
                error_kind: failure.failure.kind,
                known_account: knownAccount,
                provider_account_id: failure.externalId,
                run_id: runId,
              },
              level: "warn",
              message: knownAccount
                ? "External account failure persisted while preserving prior data"
                : "External account failure could not be associated with a known account",
            });
          } else {
            events.push({
              event: "ingestion.account.persistence_failed",
              fields: {
                error_code: failure.failure.code,
                error_kind: failure.failure.kind,
                known_account: false,
                reason: "missing_external_account_id",
                run_id: runId,
              },
              level: "warn",
              message: "External account failure could not be associated with an account",
            });
          }
          failedAccountCount += 1;
        }
        if (listing.isComplete) {
          const known = await transaction
            .select({
              accountId: externalAccounts.accountId,
              externalId: externalAccounts.externalId,
              id: externalAccounts.id,
            })
            .from(externalAccounts)
            .where(eq(externalAccounts.connectionId, context.connectionId));
          for (const externalAccount of known) {
            if (returnedIds.has(externalAccount.externalId)) continue;
            await transaction.insert(synchronizationAccountResults).values({
              errorCode: "not_seen",
              errorKind: "provider_listing",
              externalAccountId: externalAccount.id,
              sourceInstanceId: context.sourceInstanceId,
              status: "not_seen",
              synchronizationRunId: runId,
            });
            events.push({
              event: "ingestion.account.not_seen",
              fields: {
                account_id: externalAccount.accountId,
                account_external_reference_id: externalAccount.id,
                provider_account_id: externalAccount.externalId,
                run_id: runId,
              },
              level: "warn",
              message: "Known external account was not present in a complete provider listing",
            });
            failedAccountCount += 1;
          }
        } else {
          failedAccountCount += 1;
          events.push({
            event: "ingestion.account_listing.incomplete",
            fields: {
              received_account_count: listing.accounts.length,
              reported_total: listing.reportedTotal,
              run_id: runId,
            },
            level: "warn",
            message: "Provider account listing was incomplete; absence was not inferred",
          });
        }
        const status =
          failedAccountCount > 0 ? "partial" as const : "succeeded" as const;
        await transaction.insert(synchronizationConnectionResults).values({
          connectionId: context.connectionId,
          failedAccountCount,
          reportedActive: connection.active,
          reportedState: connection.sourceState,
          retryAfter: connection.nextTryAt,
          sourceInstanceId: context.sourceInstanceId,
          sourceUpdatedAt: connection.sourceUpdatedAt,
          status,
          successfulAccountCount: listing.accounts.length,
          synchronizationRunId: runId,
        });
        return {
          events,
          result: {
            failedAccountCount,
            status,
            successfulAccountCount: listing.accounts.length,
          },
        };
      });
      emitRepositoryEvents(reporter, persisted.events);
      return persisted.result;
    },
    async startRun(input) {
      try {
        const started = await withTransaction(db, async (transaction) => {
          let [source] = await transaction
            .select()
            .from(sourceInstances)
            .where(eq(sourceInstances.sourceKey, input.sourceKey))
            .limit(1);
          if (!source) {
            [source] = await transaction
              .insert(sourceInstances)
              .values({
                adapterKey: input.adapterKey,
                name: input.sourceName,
                sourceKey: input.sourceKey,
              })
              .returning();
          } else {
            [source] = await transaction
              .update(sourceInstances)
              .set({
                adapterKey: input.adapterKey,
                name: input.sourceName,
                updatedAt: new Date(),
              })
              .where(eq(sourceInstances.id, source.id))
              .returning();
          }
          if (!source) throw new Error("Failed to create source instance");
          const abandonedRuns = await transaction
            .update(synchronizationRuns)
            .set({
              errorCode: "abandoned",
              errorKind: "orchestration",
              finishedAt: sql`clock_timestamp()`,
              status: "failed",
            })
            .where(
              and(
                eq(synchronizationRuns.sourceInstanceId, source.id),
                eq(synchronizationRuns.status, "running"),
                lt(
                  synchronizationRuns.startedAt,
                  new Date(Date.now() - 2 * 60 * 60 * 1_000),
                ),
              ),
            )
            .returning({ runId: synchronizationRuns.id });
          const [run] = await transaction
            .insert(synchronizationRuns)
            .values({
              actionId: input.actionId,
              sourceInstanceId: source.id,
              startedAt: sql`clock_timestamp()`,
            })
            .returning({ id: synchronizationRuns.id });
          if (!run) throw new Error("Failed to create synchronization run");
          const events: RepositoryEvent[] = [];
          for (const abandonedRun of abandonedRuns) {
            events.push({
              event: "ingestion.run.abandoned",
              fields: {
                abandoned_run_id: abandonedRun.runId,
                replacement_run_id: run.id,
                timeout_hours: 2,
              },
              level: "warn",
              message: "Abandoned financial synchronization run marked as failed",
            });
          }
          return {
            events,
            result: { runId: run.id, status: "started" as const },
          };
        });
        emitRepositoryEvents(reporter, started.events);
        return started.result;
      } catch (error) {
        if (isUniqueViolation(error)) {
          return { status: "skipped_already_running" as const };
        }
        throw error;
      }
    },
  };
}
