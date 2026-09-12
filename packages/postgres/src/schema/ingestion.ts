import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { accounts, accountValuationCandidates, institutions } from "./financial";
import { ingestionSchema } from "./namespaces";

const mutableTimestamps = {
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
    .defaultNow()
    .notNull(),
};

export const sourceInstances = ingestionSchema.table(
  "source_instances",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceKey: text("source_key").notNull(),
    adapterKey: text("adapter_key").notNull(),
    name: text("name").notNull(),
    externalSubjectId: text("external_subject_id"),
    archivedAt: timestamp("archived_at", { mode: "date", withTimezone: true }),
    ...mutableTimestamps,
  },
  (table) => [
    uniqueIndex("source_instances_source_key_unique").on(table.sourceKey),
    uniqueIndex("source_instances_adapter_subject_unique")
      .on(table.adapterKey, table.externalSubjectId)
      .where(sql`${table.externalSubjectId} is not null`),
    check(
      "source_instances_source_key_not_blank",
      sql`length(trim(${table.sourceKey})) > 0`,
    ),
    check(
      "source_instances_adapter_key_not_blank",
      sql`length(trim(${table.adapterKey})) > 0`,
    ),
  ],
);

export const externalInstitutions = ingestionSchema.table(
  "external_institutions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceInstanceId: uuid("source_instance_id")
      .notNull()
      .references(() => sourceInstances.id, { onDelete: "restrict" }),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "restrict" }),
    externalId: text("external_id").notNull(),
    reportedName: text("reported_name"),
    firstObservedAt: timestamp("first_observed_at", {
      mode: "date",
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    lastObservedAt: timestamp("last_observed_at", {
      mode: "date",
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("external_institutions_source_external_unique").on(
      table.sourceInstanceId,
      table.externalId,
    ),
    uniqueIndex("external_institutions_id_source_unique").on(
      table.id,
      table.sourceInstanceId,
    ),
    index("external_institutions_institution_idx").on(table.institutionId),
    check(
      "external_institutions_external_id_not_blank",
      sql`length(trim(${table.externalId})) > 0`,
    ),
  ],
);

export const connections = ingestionSchema.table(
  "connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceInstanceId: uuid("source_instance_id")
      .notNull()
      .references(() => sourceInstances.id, { onDelete: "restrict" }),
    externalInstitutionId: uuid("external_institution_id")
      .notNull()
      .references(() => externalInstitutions.id, { onDelete: "restrict" }),
    externalId: text("external_id").notNull(),
    archivedAt: timestamp("archived_at", { mode: "date", withTimezone: true }),
    ...mutableTimestamps,
  },
  (table) => [
    uniqueIndex("connections_source_external_unique").on(
      table.sourceInstanceId,
      table.externalId,
    ),
    uniqueIndex("connections_id_source_unique").on(table.id, table.sourceInstanceId),
    index("connections_external_institution_idx").on(table.externalInstitutionId),
    check(
      "connections_external_id_not_blank",
      sql`length(trim(${table.externalId})) > 0`,
    ),
  ],
);

export const externalAccounts = ingestionSchema.table(
  "external_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    sourceInstanceId: uuid("source_instance_id")
      .notNull()
      .references(() => sourceInstances.id, { onDelete: "restrict" }),
    connectionId: uuid("connection_id").references(() => connections.id, {
      onDelete: "restrict",
    }),
    externalId: text("external_id").notNull(),
    reportedName: text("reported_name"),
    reportedType: text("reported_type"),
    normalizedTypeSupport: text("normalized_type_support").notNull(),
    lifecycle: text("lifecycle").default("unknown").notNull(),
    lifecycleChangedAt: timestamp("lifecycle_changed_at", {
      mode: "date",
      withTimezone: true,
    }),
    firstObservedAt: timestamp("first_observed_at", {
      mode: "date",
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    lastObservedAt: timestamp("last_observed_at", {
      mode: "date",
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("external_accounts_source_external_unique").on(
      table.sourceInstanceId,
      table.externalId,
    ),
    uniqueIndex("external_accounts_id_source_unique").on(
      table.id,
      table.sourceInstanceId,
    ),
    uniqueIndex("external_accounts_id_account_unique").on(table.id, table.accountId),
    index("external_accounts_account_idx").on(table.accountId),
    index("external_accounts_connection_idx").on(table.connectionId),
    check(
      "external_accounts_lifecycle_valid",
      sql`${table.lifecycle} in ('active', 'disabled', 'deleted', 'unknown')`,
    ),
    check(
      "external_accounts_type_support_valid",
      sql`${table.normalizedTypeSupport} in ('supported', 'known_unsupported', 'unrecognized')`,
    ),
    check(
      "external_accounts_external_id_not_blank",
      sql`length(trim(${table.externalId})) > 0`,
    ),
  ],
);

export const synchronizationRuns = ingestionSchema.table(
  "synchronization_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceInstanceId: uuid("source_instance_id")
      .notNull()
      .references(() => sourceInstances.id, { onDelete: "restrict" }),
    actionId: text("action_id").notNull(),
    status: text("status").default("running").notNull(),
    errorKind: text("error_kind"),
    errorCode: text("error_code"),
    startedAt: timestamp("started_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    finishedAt: timestamp("finished_at", { mode: "date", withTimezone: true }),
  },
  (table) => [
    uniqueIndex("synchronization_runs_id_source_unique").on(
      table.id,
      table.sourceInstanceId,
    ),
    uniqueIndex("synchronization_runs_source_running_unique")
      .on(table.sourceInstanceId)
      .where(sql`${table.status} = 'running'`),
    index("synchronization_runs_source_started_idx").on(
      table.sourceInstanceId,
      table.startedAt,
    ),
    check(
      "synchronization_runs_status_valid",
      sql`${table.status} in ('running', 'succeeded', 'partial', 'failed')`,
    ),
    check(
      "synchronization_runs_terminal_shape_valid",
      sql`(${table.status} = 'running' and ${table.finishedAt} is null) or (${table.status} <> 'running' and ${table.finishedAt} is not null)`,
    ),
  ],
);

export const synchronizationConnectionResults = ingestionSchema.table(
  "synchronization_connection_results",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceInstanceId: uuid("source_instance_id").notNull(),
    synchronizationRunId: uuid("synchronization_run_id").notNull(),
    connectionId: uuid("connection_id").notNull(),
    status: text("status").notNull(),
    reportedActive: boolean("reported_active").default(true).notNull(),
    reportedState: text("reported_state"),
    retryAfter: timestamp("retry_after", { mode: "date", withTimezone: true }),
    sourceUpdatedAt: timestamp("source_updated_at", {
      mode: "date",
      withTimezone: true,
    }),
    errorKind: text("error_kind"),
    errorCode: text("error_code"),
    successfulAccountCount: integer("successful_account_count").default(0).notNull(),
    failedAccountCount: integer("failed_account_count").default(0).notNull(),
    finishedAt: timestamp("finished_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("synchronization_connection_results_run_connection_unique").on(
      table.synchronizationRunId,
      table.connectionId,
    ),
    index("synchronization_connection_results_connection_finished_idx").on(
      table.connectionId,
      table.finishedAt,
    ),
    foreignKey({
      columns: [table.sourceInstanceId],
      foreignColumns: [sourceInstances.id],
      name: "sync_connection_results_source_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.synchronizationRunId],
      foreignColumns: [synchronizationRuns.id],
      name: "sync_connection_results_run_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.connectionId],
      foreignColumns: [connections.id],
      name: "sync_connection_results_connection_fk",
    }).onDelete("restrict"),
    check(
      "synchronization_connection_results_status_valid",
      sql`${table.status} in ('succeeded', 'partial', 'failed')`,
    ),
    check(
      "synchronization_connection_results_counts_nonnegative",
      sql`${table.successfulAccountCount} >= 0 and ${table.failedAccountCount} >= 0`,
    ),
  ],
);

export const externalAccountObservations = ingestionSchema.table(
  "external_account_observations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceInstanceId: uuid("source_instance_id").notNull(),
    synchronizationRunId: uuid("synchronization_run_id").notNull(),
    externalAccountId: uuid("external_account_id").notNull(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    observedAt: timestamp("observed_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    sourceValidAt: timestamp("source_valid_at", {
      mode: "date",
      withTimezone: true,
    }),
    reportedLifecycle: text("reported_lifecycle").notNull(),
    reportedCurrency: text("reported_currency"),
  },
  (table) => [
    uniqueIndex("external_account_observations_run_account_unique").on(
      table.synchronizationRunId,
      table.externalAccountId,
    ),
    uniqueIndex("external_account_observations_provenance_unique").on(
      table.id,
      table.synchronizationRunId,
      table.externalAccountId,
      table.sourceInstanceId,
    ),
    uniqueIndex("external_account_observations_id_account_unique").on(
      table.id,
      table.accountId,
    ),
    index("external_account_observations_external_account_time_idx").on(
      table.externalAccountId,
      table.observedAt,
    ),
    foreignKey({
      columns: [table.sourceInstanceId],
      foreignColumns: [sourceInstances.id],
      name: "external_account_observations_source_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.synchronizationRunId],
      foreignColumns: [synchronizationRuns.id],
      name: "external_account_observations_run_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.externalAccountId],
      foreignColumns: [externalAccounts.id],
      name: "external_account_observations_external_account_fk",
    }).onDelete("restrict"),
    check(
      "external_account_observations_lifecycle_valid",
      sql`${table.reportedLifecycle} in ('active', 'disabled', 'deleted', 'unknown')`,
    ),
  ],
);

export const reportedAccountValuations = ingestionSchema.table(
  "reported_account_valuations",
  {
    valuationCandidateId: uuid("valuation_candidate_id").primaryKey(),
    externalAccountObservationId: uuid("external_account_observation_id").notNull(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    valuationBasis: text("valuation_basis").notNull(),
  },
  (table) => [
    uniqueIndex("reported_account_valuations_observation_basis_unique").on(
      table.externalAccountObservationId,
      table.valuationBasis,
    ),
    foreignKey({
      columns: [table.valuationCandidateId],
      foreignColumns: [accountValuationCandidates.id],
      name: "reported_valuations_candidate_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.externalAccountObservationId],
      foreignColumns: [externalAccountObservations.id],
      name: "reported_valuations_observation_fk",
    }).onDelete("restrict"),
  ],
);

export const synchronizationAccountResults = ingestionSchema.table(
  "synchronization_account_results",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceInstanceId: uuid("source_instance_id").notNull(),
    synchronizationRunId: uuid("synchronization_run_id").notNull(),
    externalAccountId: uuid("external_account_id").notNull(),
    externalAccountObservationId: uuid("external_account_observation_id"),
    status: text("status").notNull(),
    errorKind: text("error_kind"),
    errorCode: text("error_code"),
    finishedAt: timestamp("finished_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("synchronization_account_results_run_account_unique").on(
      table.synchronizationRunId,
      table.externalAccountId,
    ),
    index("synchronization_account_results_account_finished_idx").on(
      table.externalAccountId,
      table.finishedAt,
    ),
    foreignKey({
      columns: [table.sourceInstanceId],
      foreignColumns: [sourceInstances.id],
      name: "sync_account_results_source_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.synchronizationRunId],
      foreignColumns: [synchronizationRuns.id],
      name: "sync_account_results_run_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.externalAccountId],
      foreignColumns: [externalAccounts.id],
      name: "sync_account_results_external_account_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.externalAccountObservationId],
      foreignColumns: [externalAccountObservations.id],
      name: "sync_account_results_observation_fk",
    }).onDelete("restrict"),
    check(
      "synchronization_account_results_status_valid",
      sql`${table.status} in ('succeeded', 'provider_error', 'malformed', 'not_seen')`,
    ),
    check(
      "synchronization_account_results_observation_shape_valid",
      sql`(${table.status} = 'succeeded' and ${table.externalAccountObservationId} is not null) or (${table.status} <> 'succeeded' and ${table.externalAccountObservationId} is null)`,
    ),
  ],
);

export const accountIdentityClaims = ingestionSchema.table(
  "account_identity_claims",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    externalAccountId: uuid("external_account_id").notNull(),
    claimType: text("claim_type").notNull(),
    keyVersion: text("key_version").notNull(),
    fingerprint: text("fingerprint").notNull(),
    isCurrent: boolean("is_current").default(true).notNull(),
    firstObservedRunId: uuid("first_observed_run_id").notNull(),
    lastObservedRunId: uuid("last_observed_run_id").notNull(),
    ...mutableTimestamps,
  },
  (table) => [
    uniqueIndex("account_identity_claims_value_unique").on(
      table.externalAccountId,
      table.claimType,
      table.keyVersion,
      table.fingerprint,
    ),
    uniqueIndex("account_identity_claims_current_unique")
      .on(table.externalAccountId, table.claimType, table.keyVersion)
      .where(sql`${table.isCurrent}`),
    index("account_identity_claims_lookup_idx").on(
      table.claimType,
      table.keyVersion,
      table.fingerprint,
    ),
    foreignKey({
      columns: [table.externalAccountId],
      foreignColumns: [externalAccounts.id],
      name: "account_identity_claims_external_account_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.firstObservedRunId],
      foreignColumns: [synchronizationRuns.id],
      name: "account_identity_claims_first_run_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.lastObservedRunId],
      foreignColumns: [synchronizationRuns.id],
      name: "account_identity_claims_last_run_fk",
    }).onDelete("restrict"),
    check(
      "account_identity_claims_type_valid",
      sql`${table.claimType} in ('iban', 'account_number', 'reported_name')`,
    ),
  ],
);
