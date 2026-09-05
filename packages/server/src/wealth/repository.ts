import {
  calculateWealthSnapshot,
  classifyAccountIdentity,
  connectedIdentityGroups,
  type AccountIdentityEvidence,
  type AccountKind,
  type AccountUsage,
  type AccountWealthState,
  type CurrentWealthState,
  type IdentityAccount,
  type NormalizedAccount,
  type NormalizedAccountListing,
  type NormalizedConnection,
  type SourceLifecycle,
  type StoredWealthSnapshot,
  type SynchronizationRepository,
  type SyncFailure,
  type SyncStatus,
  type ValuationBasis,
  type ValueCandidate,
  type WealthInclusion,
  type WealthRepository,
} from "@monii/application";
import { and, asc, desc, eq, inArray, isNull, lt, ne, sql } from "drizzle-orm";

import {
  accountIdentityClaims,
  accountIdentityMatches,
  accountObservations,
  accountSourceReferences,
  accountSyncResults,
  connectionSyncResults,
  dataSources,
  financialAccounts,
  institutions,
  institutionSourceReferences,
  sourceConnections,
  synchronizationRuns,
  wealthSnapshotContributions,
  wealthSnapshots,
} from "../database/schema";
import { getDb, type Database, type DatabaseTransaction } from "../database";

type Db = Database | DatabaseTransaction;

function withTransaction<T>(
  db: Db,
  callback: (transaction: DatabaseTransaction) => Promise<T>,
) {
  return "transaction" in db
    ? db.transaction(callback)
    : callback(db as DatabaseTransaction);
}

async function sourceForRun(db: Db, runId: string) {
  const [run] = await db
    .select({ dataSourceId: synchronizationRuns.dataSourceId })
    .from(synchronizationRuns)
    .where(eq(synchronizationRuns.id, runId))
    .limit(1);
  if (!run) throw new Error(`Synchronization run ${runId} does not exist`);
  return run.dataSourceId;
}

async function ensureConnection(
  db: DatabaseTransaction,
  runId: string,
  connection: NormalizedConnection,
) {
  const dataSourceId = await sourceForRun(db, runId);
  let [institutionReference] = await db
    .select({
      id: institutionSourceReferences.id,
      institutionId: institutionSourceReferences.institutionId,
    })
    .from(institutionSourceReferences)
    .where(
      and(
        eq(institutionSourceReferences.dataSourceId, dataSourceId),
        eq(institutionSourceReferences.externalId, connection.institution.externalId),
      ),
    )
    .limit(1);

  if (!institutionReference) {
    const [institution] = await db
      .insert(institutions)
      .values({ displayName: connection.institution.name })
      .returning({ id: institutions.id });
    if (!institution) throw new Error("Failed to create institution");
    [institutionReference] = await db
      .insert(institutionSourceReferences)
      .values({
        dataSourceId,
        externalId: connection.institution.externalId,
        institutionId: institution.id,
        sourceName: connection.institution.name,
      })
      .returning({
        id: institutionSourceReferences.id,
        institutionId: institutionSourceReferences.institutionId,
      });
  } else {
    await db
      .update(institutionSourceReferences)
      .set({ lastSeenAt: new Date(), sourceName: connection.institution.name })
      .where(eq(institutionSourceReferences.id, institutionReference.id));
    await db
      .update(institutions)
      .set({ displayName: connection.institution.name, updatedAt: new Date() })
      .where(eq(institutions.id, institutionReference.institutionId));
  }
  if (!institutionReference) throw new Error("Failed to create institution reference");

  let [sourceConnection] = await db
    .select({ id: sourceConnections.id })
    .from(sourceConnections)
    .where(
      and(
        eq(sourceConnections.dataSourceId, dataSourceId),
        eq(sourceConnections.externalId, connection.externalId),
      ),
    )
    .limit(1);
  if (!sourceConnection) {
    [sourceConnection] = await db
      .insert(sourceConnections)
      .values({
        dataSourceId,
        externalId: connection.externalId,
        institutionSourceReferenceId: institutionReference.id,
      })
      .returning({ id: sourceConnections.id });
  } else {
    await db
      .update(sourceConnections)
      .set({
        archivedAt: null,
        institutionSourceReferenceId: institutionReference.id,
        updatedAt: new Date(),
      })
      .where(eq(sourceConnections.id, sourceConnection.id));
  }
  if (!sourceConnection) throw new Error("Failed to create source connection");
  return {
    dataSourceId,
    institutionId: institutionReference.institutionId,
    sourceConnectionId: sourceConnection.id,
  };
}

async function saveClaims(
  db: DatabaseTransaction,
  runId: string,
  referenceId: string,
  evidence: AccountIdentityEvidence,
) {
  const claims = [
    ["iban", evidence.ibanFingerprint],
    ["account_number", evidence.accountNumberFingerprint],
    ["source_name", evidence.sourceNameFingerprint],
  ] as const;

  for (const [claimType, fingerprint] of claims) {
    if (!fingerprint) continue;
    await db
      .update(accountIdentityClaims)
      .set({ isCurrent: false, updatedAt: new Date() })
      .where(
        and(
          eq(accountIdentityClaims.accountSourceReferenceId, referenceId),
          eq(accountIdentityClaims.claimType, claimType),
          eq(accountIdentityClaims.keyVersion, evidence.keyVersion),
          ne(accountIdentityClaims.fingerprint, fingerprint),
          eq(accountIdentityClaims.isCurrent, true),
        ),
      );
    await db
      .insert(accountIdentityClaims)
      .values({
        accountSourceReferenceId: referenceId,
        claimType,
        fingerprint,
        firstSeenRunId: runId,
        keyVersion: evidence.keyVersion,
        lastSeenRunId: runId,
      })
      .onConflictDoUpdate({
        target: [
          accountIdentityClaims.accountSourceReferenceId,
          accountIdentityClaims.claimType,
          accountIdentityClaims.keyVersion,
          accountIdentityClaims.fingerprint,
        ],
        set: {
          isCurrent: true,
          lastSeenRunId: runId,
          updatedAt: new Date(),
        },
      });
  }
}

async function upsertSuccessfulAccount(
  db: DatabaseTransaction,
  context: Readonly<{
    dataSourceId: string;
    institutionId: string;
    runId: string;
    sourceConnectionId: string;
  }>,
  account: NormalizedAccount,
) {
  let [reference] = await db
    .select({
      accountId: accountSourceReferences.accountId,
      id: accountSourceReferences.id,
      lifecycle: accountSourceReferences.lifecycle,
    })
    .from(accountSourceReferences)
    .where(
      and(
        eq(accountSourceReferences.dataSourceId, context.dataSourceId),
        eq(accountSourceReferences.externalId, account.externalId),
      ),
    )
    .limit(1);

  if (!reference) {
    const [createdAccount] = await db
      .insert(financialAccounts)
      .values({
        displayName: account.name,
        institutionId: context.institutionId,
        kind: account.kind,
        usage: account.usage,
      })
      .returning({ id: financialAccounts.id });
    if (!createdAccount) throw new Error("Failed to create financial account");
    [reference] = await db
      .insert(accountSourceReferences)
      .values({
        accountId: createdAccount.id,
        dataSourceId: context.dataSourceId,
        externalId: account.externalId,
        lifecycle: account.lifecycle,
        lifecycleChangedAt: new Date(),
        sourceConnectionId: context.sourceConnectionId,
        sourceName: account.name,
        sourceType: account.sourceType,
      })
      .returning({
        accountId: accountSourceReferences.accountId,
        id: accountSourceReferences.id,
        lifecycle: accountSourceReferences.lifecycle,
      });
  } else {
    await db
      .update(accountSourceReferences)
      .set({
        lastSeenAt: new Date(),
        lifecycle: account.lifecycle,
        ...(reference.lifecycle === account.lifecycle
          ? {}
          : { lifecycleChangedAt: new Date() }),
        sourceConnectionId: context.sourceConnectionId,
        sourceName: account.name,
        sourceType: account.sourceType,
      })
      .where(eq(accountSourceReferences.id, reference.id));
    await db
      .update(financialAccounts)
      .set({
        displayName: account.name,
        institutionId: context.institutionId,
        kind: account.kind,
        updatedAt: new Date(),
        usage: account.usage,
      })
      .where(eq(financialAccounts.id, reference.accountId));
  }
  if (!reference) throw new Error("Failed to create account source reference");

  const [observation] = await db
    .insert(accountObservations)
    .values({
      accountSourceReferenceId: reference.id,
      balanceAmount: account.balance,
      currency: account.currency,
      estimatedValueAmount: account.estimatedValue,
      retrievedAt: sql`clock_timestamp()`,
      sourceLifecycle: account.lifecycle,
      sourceValidAt: account.sourceValidAt,
      synchronizationRunId: context.runId,
    })
    .returning({ id: accountObservations.id });
  if (!observation) throw new Error("Failed to create account observation");
  await db.insert(accountSyncResults).values({
    accountObservationId: observation.id,
    accountSourceReferenceId: reference.id,
    status: "succeeded",
    synchronizationRunId: context.runId,
  });
  await saveClaims(db, context.runId, reference.id, account.identity);
  return reference.id;
}

async function recordKnownFailure(
  db: DatabaseTransaction,
  dataSourceId: string,
  runId: string,
  externalId: string,
  failure: SyncFailure,
) {
  const [reference] = await db
    .select({ id: accountSourceReferences.id })
    .from(accountSourceReferences)
    .where(
      and(
        eq(accountSourceReferences.dataSourceId, dataSourceId),
        eq(accountSourceReferences.externalId, externalId),
      ),
    )
    .limit(1);
  if (!reference) return false;
  await db.insert(accountSyncResults).values({
    accountSourceReferenceId: reference.id,
    errorCode: failure.code,
    errorKind: failure.kind,
    status: failure.kind === "malformed" ? "malformed" : "provider_error",
    synchronizationRunId: runId,
  });
  return true;
}

function claimEvidence(
  claims: readonly (typeof accountIdentityClaims.$inferSelect)[],
): AccountIdentityEvidence | null {
  const sourceName = claims.find((claim) => claim.claimType === "source_name");
  if (!sourceName) return null;
  return {
    accountNumberFingerprint:
      claims.find(
        (claim) =>
          claim.claimType === "account_number" &&
          claim.keyVersion === sourceName.keyVersion,
      )?.fingerprint ?? null,
    ibanFingerprint:
      claims.find(
        (claim) => claim.claimType === "iban" && claim.keyVersion === sourceName.keyVersion,
      )?.fingerprint ?? null,
    keyVersion: sourceName.keyVersion,
    sourceNameFingerprint: sourceName.fingerprint,
  };
}

type RepositoryReporter = Readonly<{
  report(event: string, fields?: Readonly<Record<string, unknown>>): void;
}>;
type RepositoryEvent = Readonly<{
  event: string;
  fields: Readonly<Record<string, unknown>>;
}>;

async function reconcileIdentities(
  db: DatabaseTransaction,
  runId: string,
) {
  const events: RepositoryEvent[] = [];
  const references = await db
    .select({
      accountCreatedAt: financialAccounts.createdAt,
      accountId: accountSourceReferences.accountId,
      currency: accountObservations.currency,
      institutionId: financialAccounts.institutionId,
      kind: financialAccounts.kind,
      referenceId: accountSourceReferences.id,
    })
    .from(accountSourceReferences)
    .innerJoin(financialAccounts, eq(accountSourceReferences.accountId, financialAccounts.id))
    .leftJoin(
      accountObservations,
      eq(accountObservations.accountSourceReferenceId, accountSourceReferences.id),
    )
    .orderBy(desc(accountObservations.retrievedAt));
  const firstByReference = new Map<string, (typeof references)[number]>();
  for (const reference of references) {
    if (!firstByReference.has(reference.referenceId)) {
      firstByReference.set(reference.referenceId, reference);
    }
  }
  const claims = await db
    .select()
    .from(accountIdentityClaims)
    .where(eq(accountIdentityClaims.isCurrent, true))
    .orderBy(desc(accountIdentityClaims.updatedAt));
  const claimsByReference = new Map<string, typeof claims>();
  for (const claim of claims) {
    claimsByReference.set(claim.accountSourceReferenceId, [
      ...(claimsByReference.get(claim.accountSourceReferenceId) ?? []),
      claim,
    ]);
  }
  const identityAccounts: IdentityAccount[] = [];
  for (const reference of firstByReference.values()) {
    const evidence = claimEvidence(claimsByReference.get(reference.referenceId) ?? []);
    if (!evidence) continue;
    identityAccounts.push({
      accountId: reference.accountId,
      currency: reference.currency,
      evidence,
      institutionId: reference.institutionId,
      kind: reference.kind as AccountKind,
      referenceId: reference.referenceId,
    });
  }

  await db
    .update(accountIdentityMatches)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(accountIdentityMatches.classification, "likely_duplicate"));

  for (let leftIndex = 0; leftIndex < identityAccounts.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < identityAccounts.length; rightIndex += 1) {
      const left = identityAccounts[leftIndex]!;
      const right = identityAccounts[rightIndex]!;
      if (left.referenceId === right.referenceId) continue;
      const classification = classifyAccountIdentity(left, right);
      const [leftReferenceId, rightReferenceId] =
        left.referenceId < right.referenceId
          ? [left.referenceId, right.referenceId]
          : [right.referenceId, left.referenceId];
      const [existing] = await db
        .select()
        .from(accountIdentityMatches)
        .where(
          and(
            eq(accountIdentityMatches.leftAccountSourceReferenceId, leftReferenceId),
            eq(accountIdentityMatches.rightAccountSourceReferenceId, rightReferenceId),
          ),
        )
        .limit(1);

      if (classification === "distinct") {
        if (existing?.classification === "confirmed_duplicate") {
          await db
            .update(accountIdentityMatches)
            .set({ conflictDetectedAt: new Date(), updatedAt: new Date() })
            .where(eq(accountIdentityMatches.id, existing.id));
          events.push({
            event: "sync.identity_conflict",
            fields: {
              left_reference_id: leftReferenceId,
              right_reference_id: rightReferenceId,
              run_id: runId,
            },
          });
        }
        continue;
      }
      const durableClassification =
        existing?.classification === "confirmed_duplicate"
          ? "confirmed_duplicate"
          : classification;
      await db
        .insert(accountIdentityMatches)
        .values({
          classification: durableClassification,
          evidence:
            durableClassification === "confirmed_duplicate"
              ? "institution_iban_currency_kind"
              : "institution_currency_kind_source_name",
          firstDetectedRunId: runId,
          isActive: true,
          lastDetectedRunId: runId,
          leftAccountSourceReferenceId: leftReferenceId,
          rightAccountSourceReferenceId: rightReferenceId,
        })
        .onConflictDoUpdate({
          target: [
            accountIdentityMatches.leftAccountSourceReferenceId,
            accountIdentityMatches.rightAccountSourceReferenceId,
          ],
          set: {
            classification: durableClassification,
            isActive: true,
            lastDetectedRunId: runId,
            updatedAt: new Date(),
          },
        });
      if (!existing) {
        events.push({
          event: "sync.identity_match_detected",
          fields: {
            classification: durableClassification,
            left_reference_id: leftReferenceId,
            right_reference_id: rightReferenceId,
            run_id: runId,
          },
        });
      }
    }
  }

  const confirmed = await db
    .select({
      leftAccountId: accountSourceReferences.accountId,
      leftReferenceId: accountIdentityMatches.leftAccountSourceReferenceId,
      rightReferenceId: accountIdentityMatches.rightAccountSourceReferenceId,
    })
    .from(accountIdentityMatches)
    .innerJoin(
      accountSourceReferences,
      eq(accountSourceReferences.id, accountIdentityMatches.leftAccountSourceReferenceId),
    )
    .where(eq(accountIdentityMatches.classification, "confirmed_duplicate"));
  const rightReferenceIds = confirmed.map((match) => match.rightReferenceId);
  const rightReferences = rightReferenceIds.length
    ? await db
        .select({ accountId: accountSourceReferences.accountId, id: accountSourceReferences.id })
        .from(accountSourceReferences)
        .where(inArray(accountSourceReferences.id, rightReferenceIds))
    : [];
  const rightById = new Map(rightReferences.map((reference) => [reference.id, reference.accountId]));
  const pairs = confirmed.flatMap((match) => {
    const rightAccountId = rightById.get(match.rightReferenceId);
    return rightAccountId
      ? [{ leftAccountId: match.leftAccountId, rightAccountId }]
      : [];
  });
  const accountIds = [...new Set(pairs.flatMap((pair) => [pair.leftAccountId, pair.rightAccountId]))];
  const groups = connectedIdentityGroups(accountIds, pairs);

  for (const group of groups) {
    const accounts = await db
      .select()
      .from(financialAccounts)
      .where(inArray(financialAccounts.id, group))
      .orderBy(asc(financialAccounts.createdAt), asc(financialAccounts.id));
    const primary = accounts.find((account) => account.archivedAt === null) ?? accounts[0];
    if (!primary) continue;
    const mergedIds = accounts
      .filter((account) => account.id !== primary.id)
      .map((account) => account.id);
    const inclusions = accounts.map((account) => account.wealthInclusion);
    const wealthInclusion = inclusions.includes("exclude")
      ? "exclude"
      : inclusions.includes("include")
        ? "include"
        : "automatic";
    const usage = accounts.some((account) => account.usage === "professional")
      ? "professional"
      : accounts.some((account) => account.usage === "private")
        ? "private"
        : "unknown";
    await db
      .update(financialAccounts)
      .set({ updatedAt: new Date(), usage, wealthInclusion })
      .where(eq(financialAccounts.id, primary.id));
    if (mergedIds.length === 0) continue;
    await db
      .update(accountSourceReferences)
      .set({ accountId: primary.id })
      .where(inArray(accountSourceReferences.accountId, mergedIds));
    await db
      .update(financialAccounts)
      .set({
        archivedAt: new Date(),
        mergedAt: new Date(),
        mergedIntoAccountId: primary.id,
        mergeReason: "confirmed_duplicate",
        updatedAt: new Date(),
      })
      .where(inArray(financialAccounts.id, mergedIds));
    events.push({
      event: "sync.accounts_merged",
      fields: {
        merged_account_count: mergedIds.length,
        primary_account_id: primary.id,
        run_id: runId,
      },
    });
  }

  await db
    .update(accountIdentityMatches)
    .set({ isActive: false, updatedAt: new Date() })
    .where(sql`${accountIdentityMatches.classification} = 'likely_duplicate' and exists (
      select 1
      from account_source_references l
      join account_source_references r on r.id = ${accountIdentityMatches.rightAccountSourceReferenceId}
      where l.id = ${accountIdentityMatches.leftAccountSourceReferenceId}
        and l.account_id = r.account_id
    )`);
  return events;
}

function latestCandidate(
  observations: readonly (typeof accountObservations.$inferSelect)[],
  field: "balanceAmount" | "estimatedValueAmount",
): ValueCandidate | null {
  const candidates = observations
    .filter((item) => item[field] !== null && item.currency !== null)
    .sort((left, right) => {
      const leftTime = (left.sourceValidAt ?? left.retrievedAt).getTime();
      const rightTime = (right.sourceValidAt ?? right.retrievedAt).getTime();
      return rightTime - leftTime || right.retrievedAt.getTime() - left.retrievedAt.getTime();
    });
  const observation = candidates[0];
  const amount = observation?.[field];
  return observation && amount && observation.currency
    ? {
        amount,
        currency: observation.currency,
        observationId: observation.id,
        retrievedAt: observation.retrievedAt,
        sourceValidAt: observation.sourceValidAt,
      }
    : null;
}

async function loadAccountStates(db: Db): Promise<readonly AccountWealthState[]> {
  const rows = await db
    .select({
      accountId: financialAccounts.id,
      inclusion: financialAccounts.wealthInclusion,
      kind: financialAccounts.kind,
      lifecycle: accountSourceReferences.lifecycle,
      referenceId: accountSourceReferences.id,
      usage: financialAccounts.usage,
    })
    .from(financialAccounts)
    .leftJoin(accountSourceReferences, eq(accountSourceReferences.accountId, financialAccounts.id))
    .where(isNull(financialAccounts.archivedAt));
  const referenceIds = rows.flatMap((row) => (row.referenceId ? [row.referenceId] : []));
  const observations = referenceIds.length
    ? await db
        .select({ observation: accountObservations })
        .from(accountObservations)
        .innerJoin(
          accountSyncResults,
          and(
            eq(accountSyncResults.accountObservationId, accountObservations.id),
            eq(accountSyncResults.status, "succeeded"),
          ),
        )
        .where(inArray(accountObservations.accountSourceReferenceId, referenceIds))
    : [];
  const byReference = new Map<string, (typeof accountObservations.$inferSelect)[]>();
  for (const { observation } of observations) {
    byReference.set(observation.accountSourceReferenceId, [
      ...(byReference.get(observation.accountSourceReferenceId) ?? []),
      observation,
    ]);
  }

  const matches = referenceIds.length
    ? await db.select().from(accountIdentityMatches).where(eq(accountIdentityMatches.isActive, true))
    : [];
  const accountByReference = new Map(
    rows.flatMap((row) => (row.referenceId ? [[row.referenceId, row.accountId] as const] : [])),
  );
  const likelyPairs = matches.flatMap((match) => {
    if (match.classification !== "likely_duplicate") return [];
    const leftAccountId = accountByReference.get(match.leftAccountSourceReferenceId);
    const rightAccountId = accountByReference.get(match.rightAccountSourceReferenceId);
    return leftAccountId && rightAccountId && leftAccountId !== rightAccountId
      ? [{ leftAccountId, rightAccountId }]
      : [];
  });
  const accountIds = [...new Set(rows.map((row) => row.accountId))];
  const likelyGroups = connectedIdentityGroups(accountIds, likelyPairs);
  const groupByAccount = new Map<string, string>();
  for (const group of likelyGroups) {
    const groupId = [...group].sort()[0]!;
    for (const accountId of group) groupByAccount.set(accountId, groupId);
  }
  const conflictAccounts = new Set<string>();
  for (const match of matches) {
    if (!match.conflictDetectedAt) continue;
    const left = accountByReference.get(match.leftAccountSourceReferenceId);
    const right = accountByReference.get(match.rightAccountSourceReferenceId);
    if (left) conflictAccounts.add(left);
    if (right) conflictAccounts.add(right);
  }

  const syncResultRows = referenceIds.length
    ? await db
        .select({ result: accountSyncResults })
        .from(accountSyncResults)
        .innerJoin(
          synchronizationRuns,
          eq(synchronizationRuns.id, accountSyncResults.synchronizationRunId),
        )
        .where(inArray(accountSyncResults.accountSourceReferenceId, referenceIds))
        .orderBy(desc(synchronizationRuns.startedAt), desc(accountSyncResults.finishedAt))
    : [];
  const syncResults = syncResultRows.map((row) => row.result);
  const resultsByAccount = new Map<string, typeof syncResults>();
  for (const result of syncResults) {
    const accountId = accountByReference.get(result.accountSourceReferenceId);
    if (!accountId) continue;
    resultsByAccount.set(accountId, [...(resultsByAccount.get(accountId) ?? []), result]);
  }

  const grouped = new Map<string, typeof rows>();
  for (const row of rows) grouped.set(row.accountId, [...(grouped.get(row.accountId) ?? []), row]);
  return [...grouped.entries()].map(([accountId, accountRows]) => {
    const accountObservations = accountRows.flatMap((row) =>
      row.referenceId ? byReference.get(row.referenceId) ?? [] : [],
    );
    const results = resultsByAccount.get(accountId) ?? [];
    const latestRunId = results[0]?.synchronizationRunId;
    const latestRunResults = latestRunId
      ? results.filter((result) => result.synchronizationRunId === latestRunId)
      : [];
    const lifecycle = accountRows.some((row) => row.lifecycle === "active")
      ? "active"
      : accountRows[0]?.lifecycle ?? "unknown";
    return {
      accountId,
      balance: latestCandidate(accountObservations, "balanceAmount"),
      estimatedValue: latestCandidate(accountObservations, "estimatedValueAmount"),
      identityConflict: conflictAccounts.has(accountId),
      inclusion: accountRows[0]!.inclusion as WealthInclusion,
      kind: accountRows[0]!.kind as AccountKind,
      latestObservationId:
        [...accountObservations].sort(
          (left, right) => right.retrievedAt.getTime() - left.retrievedAt.getTime(),
        )[0]?.id ?? null,
      lifecycle: lifecycle as SourceLifecycle,
      likelyDuplicateGroupId: groupByAccount.get(accountId) ?? null,
      refreshUncertain:
        latestRunResults.length > 0 &&
        !latestRunResults.some((result) => result.status === "succeeded"),
      usage: accountRows[0]!.usage as AccountUsage,
    };
  });
}

async function saveSnapshot(
  db: DatabaseTransaction,
  input: Readonly<{ syncRunId?: string; trigger: "inclusion_change" | "sync" }>,
) {
  const states = await loadAccountStates(db);
  const stateByAccount = new Map(states.map((state) => [state.accountId, state]));
  const calculated = calculateWealthSnapshot(states);
  const [snapshot] = await db
    .insert(wealthSnapshots)
    .values({
      candidateAdjustedTotalAmount: calculated.candidateAdjustedTotalAmount,
      contributingAccountCount: calculated.contributingAccountCount,
      isComplete: calculated.isComplete,
      knownTotalAmount: calculated.knownTotalAmount,
      likelyDuplicateGroupCount: calculated.likelyDuplicateGroupCount,
      missingAccountCount: calculated.missingAccountCount,
      recordedAt: sql`clock_timestamp()`,
      synchronizationRunId: input.syncRunId,
      trigger: input.trigger,
    })
    .returning({ id: wealthSnapshots.id });
  if (!snapshot) throw new Error("Failed to create wealth snapshot");
  if (calculated.contributions.length) {
    await db.insert(wealthSnapshotContributions).values(
      calculated.contributions.map((item) => ({
        accountId: item.accountId,
        adjustedAmount: item.adjustedAmount,
        amount: item.amount,
        basis: item.basis,
        decision: item.decision,
        duplicateRole: item.duplicateRole,
        identityConflict: stateByAccount.get(item.accountId)?.identityConflict ?? false,
        latestObservationId: item.latestObservationId,
        reportedAmount: item.reportedAmount,
        reportedCurrency: item.reportedCurrency,
        valueObservationId: item.valueObservationId,
        wealthSnapshotId: snapshot.id,
      })),
    );
  }
  return {
    contributing_account_count: calculated.contributingAccountCount,
    is_complete: calculated.isComplete,
    likely_duplicate_group_count: calculated.likelyDuplicateGroupCount,
    missing_account_count: calculated.missingAccountCount,
    snapshot_id: snapshot.id,
    synchronization_run_id: input.syncRunId ?? null,
  };
}

async function currentWealthState(db: Db): Promise<CurrentWealthState> {
  const [snapshot] = await db
    .select()
    .from(wealthSnapshots)
    .orderBy(desc(wealthSnapshots.recordedAt), desc(wealthSnapshots.id))
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
      lastSuccessfulSyncAt: lastSuccessfulRun?.finishedAt ?? null,
      latestSyncStatus: (latestRun?.status as SyncStatus | undefined) ?? null,
      snapshot: null,
    };
  }

  const rows = await db
    .select({
      accountId: financialAccounts.id,
      accountName: financialAccounts.displayName,
      adjustedAmount: wealthSnapshotContributions.adjustedAmount,
      amount: wealthSnapshotContributions.amount,
      basis: wealthSnapshotContributions.basis,
      decision: wealthSnapshotContributions.decision,
      duplicateRole: wealthSnapshotContributions.duplicateRole,
      identityConflict: wealthSnapshotContributions.identityConflict,
      institutionId: institutions.id,
      institutionName: institutions.displayName,
      kind: financialAccounts.kind,
      latestObservationId: wealthSnapshotContributions.latestObservationId,
      reportedAmount: wealthSnapshotContributions.reportedAmount,
      reportedCurrency: wealthSnapshotContributions.reportedCurrency,
      valueObservationId: wealthSnapshotContributions.valueObservationId,
    })
    .from(wealthSnapshotContributions)
    .innerJoin(financialAccounts, eq(wealthSnapshotContributions.accountId, financialAccounts.id))
    .innerJoin(institutions, eq(financialAccounts.institutionId, institutions.id))
    .where(eq(wealthSnapshotContributions.wealthSnapshotId, snapshot.id));
  const observationIds = rows.flatMap((row) =>
    row.valueObservationId ? [row.valueObservationId] : row.latestObservationId ? [row.latestObservationId] : [],
  );
  const observations = observationIds.length
    ? await db.select().from(accountObservations).where(inArray(accountObservations.id, observationIds))
    : [];
  const observationById = new Map(observations.map((observation) => [observation.id, observation]));
  const accountIds = rows.map((row) => row.accountId);
  const references = accountIds.length
    ? await db
        .select()
        .from(accountSourceReferences)
        .where(inArray(accountSourceReferences.accountId, accountIds))
    : [];
  const referenceById = new Map(references.map((reference) => [reference.id, reference]));
  const sourceIds = [...new Set(references.map((reference) => reference.dataSourceId))];
  const sourceRuns = sourceIds.length
    ? await db
        .select()
        .from(synchronizationRuns)
        .where(inArray(synchronizationRuns.dataSourceId, sourceIds))
        .orderBy(desc(synchronizationRuns.startedAt))
    : [];
  const latestRunBySource = new Map<string, (typeof sourceRuns)[number]>();
  for (const run of sourceRuns) {
    if (!latestRunBySource.has(run.dataSourceId)) {
      latestRunBySource.set(run.dataSourceId, run);
    }
  }
  const accountByReference = new Map(references.map((reference) => [reference.id, reference.accountId]));
  const resultRows = references.length
    ? await db
        .select({ result: accountSyncResults })
        .from(accountSyncResults)
        .innerJoin(
          synchronizationRuns,
          eq(synchronizationRuns.id, accountSyncResults.synchronizationRunId),
        )
        .where(inArray(accountSyncResults.accountSourceReferenceId, references.map((item) => item.id)))
        .orderBy(desc(synchronizationRuns.startedAt), desc(accountSyncResults.finishedAt))
    : [];
  const results = resultRows.map((row) => row.result);
  const latestFailureByAccount = new Map<string, boolean>();
  for (const accountId of accountIds) {
    const accountResults = results.filter(
      (result) => accountByReference.get(result.accountSourceReferenceId) === accountId,
    );
    const runId = accountResults[0]?.synchronizationRunId;
    if (runId) {
      latestFailureByAccount.set(
        accountId,
        !accountResults.some(
          (result) => result.synchronizationRunId === runId && result.status === "succeeded",
        ),
      );
    }
  }
  const storedSnapshot: StoredWealthSnapshot = {
    accounts: rows.map((row) => {
      const observation = observationById.get(
        row.valueObservationId ?? row.latestObservationId ?? "",
      );
      const valueTime = observation?.retrievedAt.getTime() ?? 0;
      const selectedReference = observation
        ? referenceById.get(observation.accountSourceReferenceId)
        : undefined;
      const selectedSourceRun = selectedReference
        ? latestRunBySource.get(selectedReference.dataSourceId)
        : undefined;
      const sourceFailed =
        selectedSourceRun?.status === "failed" &&
        selectedSourceRun.startedAt.getTime() > valueTime;
      return {
        accountId: row.accountId,
        adjustedAmount: row.adjustedAmount,
        amount: row.amount,
        basis: row.basis as ValuationBasis | null,
        decision: row.decision as StoredWealthSnapshot["accounts"][number]["decision"],
        duplicateRole: row.duplicateRole as StoredWealthSnapshot["accounts"][number]["duplicateRole"],
        hasNewerFailedSync:
          (latestFailureByAccount.get(row.accountId) ?? false) || sourceFailed,
        identityConflict: row.identityConflict,
        institutionId: row.institutionId,
        institutionName: row.institutionName,
        kind: row.kind as AccountKind,
        name: row.accountName,
        reportedAmount: row.reportedAmount,
        reportedCurrency: row.reportedCurrency,
        sourceValidAt: observation?.sourceValidAt ?? null,
        valueRetrievedAt: observation?.retrievedAt ?? null,
      };
    }),
    candidateAdjustedTotalAmount: snapshot.candidateAdjustedTotalAmount,
    isComplete: snapshot.isComplete,
    knownTotalAmount: snapshot.knownTotalAmount,
    likelyDuplicateGroupCount: snapshot.likelyDuplicateGroupCount,
    recordedAt: snapshot.recordedAt,
    snapshotId: snapshot.id,
  };
  return {
    lastSuccessfulSyncAt: lastSuccessfulRun?.finishedAt ?? null,
    latestSyncStatus: (latestRun?.status as SyncStatus | undefined) ?? null,
    snapshot: storedSnapshot,
  };
}

function isRunningConstraint(error: unknown) {
  let candidate = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof candidate !== "object" || candidate === null) return false;
    if (
      "code" in candidate &&
      (candidate as { code?: unknown }).code === "23505"
    ) {
      return true;
    }
    candidate = "cause" in candidate ? candidate.cause : null;
  }
  return false;
}

export function createFinancialRepository(
  db: Db = getDb(),
  reporter?: RepositoryReporter,
): SynchronizationRepository & WealthRepository {
  return {
    async createSnapshot(input) {
      const snapshot = await withTransaction(db, (transaction) =>
        saveSnapshot(transaction, input),
      );
      reporter?.report("sync.snapshot_created", snapshot);
    },
    async finalizeRun(runId, status, failure) {
      const finalized = await withTransaction(db, async (transaction) => {
        const events = await reconcileIdentities(transaction, runId);
        const snapshot = await saveSnapshot(transaction, {
          syncRunId: runId,
          trigger: "sync",
        });
        await transaction
          .update(synchronizationRuns)
          .set({
            errorCode: failure?.code ?? null,
            errorKind: failure?.kind ?? null,
            finishedAt: sql`clock_timestamp()`,
            status,
          })
          .where(eq(synchronizationRuns.id, runId));
        return { events, snapshot };
      });
      for (const event of finalized.events) {
        reporter?.report(event.event, event.fields);
      }
      reporter?.report("sync.snapshot_created", finalized.snapshot);
    },
    async identifyRunSource(runId, externalSubjectId) {
      const dataSourceId = await sourceForRun(db, runId);
      const [source] = await db.select().from(dataSources).where(eq(dataSources.id, dataSourceId)).limit(1);
      if (!source) throw new Error("Synchronization data source does not exist");
      if (source.externalSubjectId && source.externalSubjectId !== externalSubjectId) {
        throw new Error(`Data source ${source.key} is configured for a different external subject`);
      }
      await db
        .update(dataSources)
        .set({ externalSubjectId, updatedAt: new Date() })
        .where(eq(dataSources.id, dataSourceId));
    },
    loadCurrentWealthState: () => currentWealthState(db),
    async markRunFailed(runId, failure) {
      await db
        .update(synchronizationRuns)
        .set({
          errorCode: failure.code,
          errorKind: failure.kind,
          finishedAt: sql`clock_timestamp()`,
          status: "failed",
        })
        .where(eq(synchronizationRuns.id, runId));
    },
    async recordConnectionFailure(runId, connection, failure) {
      await withTransaction(db, async (transaction) => {
        const context = await ensureConnection(transaction, runId, connection);
        await transaction.insert(connectionSyncResults).values({
          errorCode: failure.code,
          errorKind: failure.kind,
          failedAccountCount: 0,
          sourceActive: connection.active,
          sourceConnectionId: context.sourceConnectionId,
          sourceNextTryAt: connection.nextTryAt,
          sourceState: connection.sourceState,
          sourceUpdatedAt: connection.sourceUpdatedAt,
          status: "failed",
          successfulAccountCount: 0,
          synchronizationRunId: runId,
        });
      });
    },
    async recordConnectionResult(runId, connection, listing: NormalizedAccountListing) {
      return withTransaction(db, async (transaction) => {
        const context = await ensureConnection(transaction, runId, connection);
        const returnedIds = new Set<string>();
        for (const account of listing.accounts) {
          returnedIds.add(account.externalId);
          await upsertSuccessfulAccount(transaction, { ...context, runId }, account);
        }
        let failedAccountCount = 0;
        for (const account of listing.failures) {
          if (account.externalId) returnedIds.add(account.externalId);
          if (
            account.externalId &&
            (await recordKnownFailure(
              transaction,
              context.dataSourceId,
              runId,
              account.externalId,
              account.failure,
            ))
          ) {
            failedAccountCount += 1;
          } else {
            failedAccountCount += 1;
          }
        }
        if (listing.isComplete) {
          const known = await transaction
            .select({ externalId: accountSourceReferences.externalId, id: accountSourceReferences.id })
            .from(accountSourceReferences)
            .where(eq(accountSourceReferences.sourceConnectionId, context.sourceConnectionId));
          for (const reference of known) {
            if (returnedIds.has(reference.externalId)) continue;
            await transaction.insert(accountSyncResults).values({
              accountSourceReferenceId: reference.id,
              errorCode: "not_seen",
              errorKind: "provider_listing",
              status: "not_seen",
              synchronizationRunId: runId,
            });
            failedAccountCount += 1;
          }
        }
        if (!listing.isComplete) failedAccountCount += 1;
        const status = failedAccountCount > 0 ? "partial" : "succeeded";
        await transaction.insert(connectionSyncResults).values({
          failedAccountCount,
          sourceActive: connection.active,
          sourceConnectionId: context.sourceConnectionId,
          sourceNextTryAt: connection.nextTryAt,
          sourceState: connection.sourceState,
          sourceUpdatedAt: connection.sourceUpdatedAt,
          status,
          successfulAccountCount: listing.accounts.length,
          synchronizationRunId: runId,
        });
        return {
          failedAccountCount,
          status,
          successfulAccountCount: listing.accounts.length,
        };
      });
    },
    async setAccountInclusion(accountId, inclusion) {
      const updated = await db
        .update(financialAccounts)
        .set({ updatedAt: new Date(), wealthInclusion: inclusion })
        .where(and(eq(financialAccounts.id, accountId), isNull(financialAccounts.archivedAt)))
        .returning({ id: financialAccounts.id });
      return updated.length > 0;
    },
    async startRun(input) {
      try {
        return await withTransaction(db, async (transaction) => {
          let [source] = await transaction
            .select()
            .from(dataSources)
            .where(eq(dataSources.key, input.sourceKey))
            .limit(1);
          if (!source) {
            [source] = await transaction
              .insert(dataSources)
              .values({ displayName: input.sourceName, key: input.sourceKey, kind: input.sourceKind })
              .returning();
          } else {
            [source] = await transaction
              .update(dataSources)
              .set({ displayName: input.sourceName, kind: input.sourceKind, updatedAt: new Date() })
              .where(eq(dataSources.id, source.id))
              .returning();
          }
          if (!source) throw new Error("Failed to create data source");
          await transaction
            .update(synchronizationRuns)
            .set({
              errorCode: "abandoned",
              errorKind: "orchestration",
              finishedAt: sql`clock_timestamp()`,
              status: "failed",
            })
            .where(
              and(
                eq(synchronizationRuns.dataSourceId, source.id),
                eq(synchronizationRuns.status, "running"),
                lt(synchronizationRuns.startedAt, new Date(Date.now() - 2 * 60 * 60 * 1_000)),
              ),
            );
          const [run] = await transaction
            .insert(synchronizationRuns)
            .values({
              actionId: input.actionId,
              dataSourceId: source.id,
              startedAt: sql`clock_timestamp()`,
            })
            .returning({ id: synchronizationRuns.id });
          if (!run) throw new Error("Failed to create synchronization run");
          return { runId: run.id, status: "started" as const };
        });
      } catch (error) {
        if (isRunningConstraint(error)) return { status: "skipped_already_running" as const };
        throw error;
      }
    },
  };
}
