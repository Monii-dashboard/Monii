import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
    .defaultNow()
    .notNull(),
};

export const dataSources = pgTable(
  "data_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    key: text("key").notNull(),
    kind: text("kind").notNull(),
    displayName: text("display_name").notNull(),
    externalSubjectId: text("external_subject_id"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("data_sources_key_unique").on(table.key),
    check("data_sources_key_not_blank", sql`length(trim(${table.key})) > 0`),
    check("data_sources_kind_not_blank", sql`length(trim(${table.kind})) > 0`),
  ],
);

export const institutions = pgTable(
  "institutions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    displayName: text("display_name").notNull(),
    ...timestamps,
  },
  (table) => [
    check(
      "institutions_display_name_not_blank",
      sql`length(trim(${table.displayName})) > 0`,
    ),
  ],
);

export const institutionSourceReferences = pgTable(
  "institution_source_references",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "restrict" }),
    dataSourceId: uuid("data_source_id")
      .notNull()
      .references(() => dataSources.id, { onDelete: "restrict" }),
    externalId: text("external_id").notNull(),
    sourceName: text("source_name").notNull(),
    firstSeenAt: timestamp("first_seen_at", {
      mode: "date",
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp("last_seen_at", {
      mode: "date",
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("institution_source_references_external_unique").on(
      table.dataSourceId,
      table.externalId,
    ),
    index("institution_source_references_institution_idx").on(
      table.institutionId,
    ),
    check(
      "institution_source_references_external_id_not_blank",
      sql`length(trim(${table.externalId})) > 0`,
    ),
  ],
);

export const sourceConnections = pgTable(
  "source_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    dataSourceId: uuid("data_source_id")
      .notNull()
      .references(() => dataSources.id, { onDelete: "restrict" }),
    institutionSourceReferenceId: uuid("institution_source_reference_id")
      .notNull()
      .references(() => institutionSourceReferences.id, {
        onDelete: "restrict",
      }),
    externalId: text("external_id").notNull(),
    archivedAt: timestamp("archived_at", {
      mode: "date",
      withTimezone: true,
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("source_connections_external_unique").on(
      table.dataSourceId,
      table.externalId,
    ),
    index("source_connections_institution_reference_idx").on(
      table.institutionSourceReferenceId,
    ),
    check(
      "source_connections_external_id_not_blank",
      sql`length(trim(${table.externalId})) > 0`,
    ),
  ],
);

export const financialAccounts = pgTable(
  "financial_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "restrict" }),
    displayName: text("display_name").notNull(),
    kind: text("kind").notNull(),
    usage: text("usage").notNull(),
    wealthInclusion: text("wealth_inclusion").default("automatic").notNull(),
    archivedAt: timestamp("archived_at", {
      mode: "date",
      withTimezone: true,
    }),
    mergedIntoAccountId: uuid("merged_into_account_id").references(
      (): AnyPgColumn => financialAccounts.id,
      { onDelete: "restrict" },
    ),
    mergedAt: timestamp("merged_at", { mode: "date", withTimezone: true }),
    mergeReason: text("merge_reason"),
    ...timestamps,
  },
  (table) => [
    index("financial_accounts_institution_idx").on(table.institutionId),
    check(
      "financial_accounts_kind_valid",
      sql`${table.kind} in ('cash', 'investment', 'unsupported', 'unknown')`,
    ),
    check(
      "financial_accounts_usage_valid",
      sql`${table.usage} in ('private', 'professional', 'unknown')`,
    ),
    check(
      "financial_accounts_wealth_inclusion_valid",
      sql`${table.wealthInclusion} in ('automatic', 'include', 'exclude')`,
    ),
  ],
);

export const accountSourceReferences = pgTable(
  "account_source_references",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => financialAccounts.id, { onDelete: "restrict" }),
    dataSourceId: uuid("data_source_id")
      .notNull()
      .references(() => dataSources.id, { onDelete: "restrict" }),
    sourceConnectionId: uuid("source_connection_id").references(
      () => sourceConnections.id,
      { onDelete: "restrict" },
    ),
    externalId: text("external_id").notNull(),
    sourceName: text("source_name").notNull(),
    sourceType: text("source_type"),
    lifecycle: text("lifecycle").default("unknown").notNull(),
    lifecycleChangedAt: timestamp("lifecycle_changed_at", {
      mode: "date",
      withTimezone: true,
    }),
    firstSeenAt: timestamp("first_seen_at", {
      mode: "date",
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp("last_seen_at", {
      mode: "date",
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("account_source_references_external_unique").on(
      table.dataSourceId,
      table.externalId,
    ),
    index("account_source_references_connection_idx").on(
      table.sourceConnectionId,
    ),
    check(
      "account_source_references_lifecycle_valid",
      sql`${table.lifecycle} in ('active', 'disabled', 'deleted', 'unknown')`,
    ),
  ],
);

export const accountIdentityClaims = pgTable(
  "account_identity_claims",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountSourceReferenceId: uuid("account_source_reference_id")
      .notNull()
      .references(() => accountSourceReferences.id, { onDelete: "restrict" }),
    claimType: text("claim_type").notNull(),
    keyVersion: text("key_version").notNull(),
    fingerprint: text("fingerprint").notNull(),
    isCurrent: boolean("is_current").default(true).notNull(),
    firstSeenRunId: uuid("first_seen_run_id")
      .notNull()
      .references(() => synchronizationRuns.id, { onDelete: "restrict" }),
    lastSeenRunId: uuid("last_seen_run_id")
      .notNull()
      .references(() => synchronizationRuns.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("account_identity_claims_value_unique").on(
      table.accountSourceReferenceId,
      table.claimType,
      table.keyVersion,
      table.fingerprint,
    ),
    uniqueIndex("account_identity_claims_current_unique")
      .on(table.accountSourceReferenceId, table.claimType, table.keyVersion)
      .where(sql`${table.isCurrent}`),
    index("account_identity_claims_lookup_idx").on(
      table.claimType,
      table.keyVersion,
      table.fingerprint,
    ),
    check(
      "account_identity_claims_type_valid",
      sql`${table.claimType} in ('iban', 'account_number', 'source_name')`,
    ),
  ],
);

export const synchronizationRuns = pgTable(
  "synchronization_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    dataSourceId: uuid("data_source_id")
      .notNull()
      .references(() => dataSources.id, { onDelete: "restrict" }),
    actionId: text("action_id").notNull(),
    status: text("status").default("running").notNull(),
    errorKind: text("error_kind"),
    errorCode: text("error_code"),
    startedAt: timestamp("started_at", {
      mode: "date",
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    finishedAt: timestamp("finished_at", {
      mode: "date",
      withTimezone: true,
    }),
  },
  (table) => [
    index("synchronization_runs_source_started_idx").on(
      table.dataSourceId,
      table.startedAt,
    ),
    uniqueIndex("synchronization_runs_source_running_unique")
      .on(table.dataSourceId)
      .where(sql`${table.status} = 'running'`),
    check(
      "synchronization_runs_status_valid",
      sql`${table.status} in ('running', 'succeeded', 'partial', 'failed')`,
    ),
  ],
);

export const connectionSyncResults = pgTable(
  "connection_sync_results",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    synchronizationRunId: uuid("synchronization_run_id")
      .notNull()
      .references(() => synchronizationRuns.id, { onDelete: "restrict" }),
    sourceConnectionId: uuid("source_connection_id")
      .notNull()
      .references(() => sourceConnections.id, { onDelete: "restrict" }),
    status: text("status").notNull(),
    sourceActive: boolean("source_active").default(true).notNull(),
    sourceState: text("source_state"),
    sourceNextTryAt: timestamp("source_next_try_at", {
      mode: "date",
      withTimezone: true,
    }),
    sourceUpdatedAt: timestamp("source_updated_at", {
      mode: "date",
      withTimezone: true,
    }),
    errorKind: text("error_kind"),
    errorCode: text("error_code"),
    successfulAccountCount: integer("successful_account_count").default(0).notNull(),
    failedAccountCount: integer("failed_account_count").default(0).notNull(),
    finishedAt: timestamp("finished_at", {
      mode: "date",
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("connection_sync_results_run_connection_unique").on(
      table.synchronizationRunId,
      table.sourceConnectionId,
    ),
    index("connection_sync_results_connection_finished_idx").on(
      table.sourceConnectionId,
      table.finishedAt,
    ),
    check(
      "connection_sync_results_status_valid",
      sql`${table.status} in ('succeeded', 'partial', 'failed')`,
    ),
    check(
      "connection_sync_results_counts_nonnegative",
      sql`${table.successfulAccountCount} >= 0 and ${table.failedAccountCount} >= 0`,
    ),
  ],
);

export const accountObservations = pgTable(
  "account_observations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    synchronizationRunId: uuid("synchronization_run_id")
      .notNull()
      .references(() => synchronizationRuns.id, { onDelete: "restrict" }),
    accountSourceReferenceId: uuid("account_source_reference_id")
      .notNull()
      .references(() => accountSourceReferences.id, { onDelete: "restrict" }),
    retrievedAt: timestamp("retrieved_at", {
      mode: "date",
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    sourceValidAt: timestamp("source_valid_at", {
      mode: "date",
      withTimezone: true,
    }),
    sourceLifecycle: text("source_lifecycle").notNull(),
    currency: text("currency"),
    balanceAmount: numeric("balance_amount", {
      precision: 24,
      scale: 8,
    }),
    estimatedValueAmount: numeric("estimated_value_amount", {
      precision: 24,
      scale: 8,
    }),
  },
  (table) => [
    uniqueIndex("account_observations_run_reference_unique").on(
      table.synchronizationRunId,
      table.accountSourceReferenceId,
    ),
    index("account_observations_reference_retrieved_idx").on(
      table.accountSourceReferenceId,
      table.retrievedAt,
    ),
    check(
      "account_observations_source_lifecycle_valid",
      sql`${table.sourceLifecycle} in ('active', 'disabled', 'deleted', 'unknown')`,
    ),
    check(
      "account_observations_currency_valid",
      sql`${table.currency} is null or ${table.currency} ~ '^[A-Z]{3}$'`,
    ),
  ],
);

export const accountSyncResults = pgTable(
  "account_sync_results",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    synchronizationRunId: uuid("synchronization_run_id")
      .notNull()
      .references(() => synchronizationRuns.id, { onDelete: "restrict" }),
    accountSourceReferenceId: uuid("account_source_reference_id")
      .notNull()
      .references(() => accountSourceReferences.id, { onDelete: "restrict" }),
    accountObservationId: uuid("account_observation_id").references(
      () => accountObservations.id,
      { onDelete: "restrict" },
    ),
    status: text("status").notNull(),
    errorKind: text("error_kind"),
    errorCode: text("error_code"),
    finishedAt: timestamp("finished_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("account_sync_results_run_reference_unique").on(
      table.synchronizationRunId,
      table.accountSourceReferenceId,
    ),
    index("account_sync_results_reference_finished_idx").on(
      table.accountSourceReferenceId,
      table.finishedAt,
    ),
    check(
      "account_sync_results_status_valid",
      sql`${table.status} in ('succeeded', 'provider_error', 'malformed', 'not_seen')`,
    ),
    check(
      "account_sync_results_observation_shape_valid",
      sql`(${table.status} = 'succeeded' and ${table.accountObservationId} is not null) or (${table.status} <> 'succeeded' and ${table.accountObservationId} is null)`,
    ),
  ],
);

export const accountIdentityMatches = pgTable(
  "account_identity_matches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    leftAccountSourceReferenceId: uuid("left_account_source_reference_id")
      .notNull()
      .references(() => accountSourceReferences.id, { onDelete: "restrict" }),
    rightAccountSourceReferenceId: uuid("right_account_source_reference_id")
      .notNull()
      .references(() => accountSourceReferences.id, { onDelete: "restrict" }),
    classification: text("classification").notNull(),
    evidence: text("evidence").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    conflictDetectedAt: timestamp("conflict_detected_at", {
      mode: "date",
      withTimezone: true,
    }),
    firstDetectedRunId: uuid("first_detected_run_id")
      .notNull()
      .references(() => synchronizationRuns.id, { onDelete: "restrict" }),
    lastDetectedRunId: uuid("last_detected_run_id")
      .notNull()
      .references(() => synchronizationRuns.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("account_identity_matches_pair_unique").on(
      table.leftAccountSourceReferenceId,
      table.rightAccountSourceReferenceId,
    ),
    check(
      "account_identity_matches_ordered_pair",
      sql`${table.leftAccountSourceReferenceId}::text < ${table.rightAccountSourceReferenceId}::text`,
    ),
    check(
      "account_identity_matches_classification_valid",
      sql`${table.classification} in ('confirmed_duplicate', 'likely_duplicate', 'dismissed')`,
    ),
  ],
);

export const wealthSnapshots = pgTable(
  "wealth_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    trigger: text("trigger").notNull(),
    synchronizationRunId: uuid("synchronization_run_id").references(
      () => synchronizationRuns.id,
      { onDelete: "restrict" },
    ),
    currency: text("currency").default("EUR").notNull(),
    knownTotalAmount: numeric("known_total_amount", {
      precision: 24,
      scale: 8,
    }).notNull(),
    candidateAdjustedTotalAmount: numeric("candidate_adjusted_total_amount", {
      precision: 24,
      scale: 8,
    }).notNull(),
    likelyDuplicateGroupCount: integer("likely_duplicate_group_count")
      .default(0)
      .notNull(),
    isComplete: boolean("is_complete").notNull(),
    contributingAccountCount: integer("contributing_account_count").notNull(),
    missingAccountCount: integer("missing_account_count").notNull(),
    recordedAt: timestamp("recorded_at", {
      mode: "date",
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("wealth_snapshots_recorded_idx").on(table.recordedAt),
    uniqueIndex("wealth_snapshots_sync_run_unique")
      .on(table.synchronizationRunId)
      .where(sql`${table.synchronizationRunId} is not null`),
    check(
      "wealth_snapshots_trigger_valid",
      sql`${table.trigger} in ('sync', 'inclusion_change')`,
    ),
    check("wealth_snapshots_currency_eur", sql`${table.currency} = 'EUR'`),
    check(
      "wealth_snapshots_counts_nonnegative",
      sql`${table.contributingAccountCount} >= 0 and ${table.missingAccountCount} >= 0 and ${table.likelyDuplicateGroupCount} >= 0`,
    ),
  ],
);

export const wealthSnapshotContributions = pgTable(
  "wealth_snapshot_contributions",
  {
    wealthSnapshotId: uuid("wealth_snapshot_id")
      .notNull()
      .references(() => wealthSnapshots.id, { onDelete: "restrict" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => financialAccounts.id, { onDelete: "restrict" }),
    latestObservationId: uuid("latest_observation_id").references(
      () => accountObservations.id,
      { onDelete: "restrict" },
    ),
    valueObservationId: uuid("value_observation_id").references(
      () => accountObservations.id,
      { onDelete: "restrict" },
    ),
    decision: text("decision").notNull(),
    basis: text("basis"),
    amount: numeric("amount", { precision: 24, scale: 8 }),
    adjustedAmount: numeric("adjusted_amount", { precision: 24, scale: 8 }),
    duplicateRole: text("duplicate_role").default("none").notNull(),
    reportedAmount: numeric("reported_amount", { precision: 24, scale: 8 }),
    reportedCurrency: text("reported_currency"),
    identityConflict: boolean("identity_conflict").default(false).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.wealthSnapshotId, table.accountId] }),
    index("wealth_snapshot_contributions_account_idx").on(table.accountId),
    check(
      "wealth_snapshot_contributions_decision_valid",
      sql`${table.decision} in ('contributing', 'excluded_operator', 'excluded_professional', 'excluded_source', 'missing_value', 'unknown_type', 'unsupported', 'unsupported_currency')`,
    ),
    check(
      "wealth_snapshot_contributions_duplicate_role_valid",
      sql`${table.duplicateRole} in ('none', 'representative', 'excluded_from_adjusted')`,
    ),
    check(
      "wealth_snapshot_contributions_basis_valid",
      sql`${table.basis} is null or ${table.basis} in ('balance', 'estimated_value')`,
    ),
    check(
      "wealth_snapshot_contributions_value_shape_valid",
      sql`(
        ${table.decision} = 'contributing'
        and ${table.amount} is not null
        and ${table.basis} is not null
        and ${table.valueObservationId} is not null
      ) or (
        ${table.decision} <> 'contributing'
        and ${table.amount} is null
        and ${table.basis} is null
        and ${table.valueObservationId} is null
      )`,
    ),
  ],
);
