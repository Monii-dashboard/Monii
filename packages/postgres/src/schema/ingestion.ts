import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { defineModelTable } from "../model-table";
import {
  accounts,
  accountValuationCandidates,
  institutions,
} from "./financial";
import { ingestionSchema } from "./namespaces";

const mutableTimestamps = {
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
    .defaultNow()
    .notNull(),
};

export const sourceInstances = defineModelTable({
  schema: ingestionSchema,
  name: "source_instances",
  columns: {
    id: uuid("id").defaultRandom().notNull(),
    sourceKey: text("source_key").notNull(),
    adapterKey: text("adapter_key").notNull(),
    name: text("name").notNull(),
    externalSubjectId: text("external_subject_id"),
    archivedAt: timestamp("archived_at", {
      mode: "date",
      withTimezone: true,
    }),
    ...mutableTimestamps,
  },
  primaryKey: ["id"],
  writePolicy: "mutable-no-delete",
  immutableFields: ["sourceKey", "createdAt"],
  constraints: (table) => [
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
});

export const externalInstitutions = defineModelTable({
  schema: ingestionSchema,
  name: "external_institutions",
  columns: {
    id: uuid("id").defaultRandom().notNull(),
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
  primaryKey: ["id"],
  writePolicy: "mutable-no-delete",
  immutableFields: [
    "sourceInstanceId",
    "institutionId",
    "externalId",
    "firstObservedAt",
  ],
  constraints: (table) => [
    uniqueIndex("external_institutions_source_external_unique").on(
      table.sourceInstanceId,
      table.externalId,
    ),
    unique("external_institutions_id_source_unique").on(
      table.id,
      table.sourceInstanceId,
    ),
    index("external_institutions_institution_idx").on(table.institutionId),
    check(
      "external_institutions_external_id_not_blank",
      sql`length(trim(${table.externalId})) > 0`,
    ),
  ],
});

export const connections = defineModelTable({
  schema: ingestionSchema,
  name: "connections",
  columns: {
    id: uuid("id").defaultRandom().notNull(),
    sourceInstanceId: uuid("source_instance_id")
      .notNull()
      .references(() => sourceInstances.id, { onDelete: "restrict" }),
    externalInstitutionId: uuid("external_institution_id").notNull(),
    externalId: text("external_id").notNull(),
    archivedAt: timestamp("archived_at", {
      mode: "date",
      withTimezone: true,
    }),
    ...mutableTimestamps,
  },
  primaryKey: ["id"],
  writePolicy: "mutable-no-delete",
  immutableFields: ["sourceInstanceId", "externalId", "createdAt"],
  constraints: (table) => [
    uniqueIndex("connections_source_external_unique").on(
      table.sourceInstanceId,
      table.externalId,
    ),
    unique("connections_id_source_unique").on(
      table.id,
      table.sourceInstanceId,
    ),
    index("connections_external_institution_idx").on(
      table.externalInstitutionId,
    ),
    foreignKey({
      columns: [table.externalInstitutionId, table.sourceInstanceId],
      foreignColumns: [
        externalInstitutions.id,
        externalInstitutions.sourceInstanceId,
      ],
      name: "connections_external_institution_source_fk",
    }).onDelete("restrict"),
    check(
      "connections_external_id_not_blank",
      sql`length(trim(${table.externalId})) > 0`,
    ),
  ],
});

export const externalAccounts = defineModelTable({
  schema: ingestionSchema,
  name: "external_accounts",
  columns: {
    id: uuid("id").defaultRandom().notNull(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    sourceInstanceId: uuid("source_instance_id")
      .notNull()
      .references(() => sourceInstances.id, { onDelete: "restrict" }),
    connectionId: uuid("connection_id"),
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
  primaryKey: ["id"],
  writePolicy: "mutable-no-delete",
  immutableFields: [
    "accountId",
    "sourceInstanceId",
    "externalId",
    "firstObservedAt",
  ],
  constraints: (table) => [
    uniqueIndex("external_accounts_source_external_unique").on(
      table.sourceInstanceId,
      table.externalId,
    ),
    unique("external_accounts_id_source_unique").on(
      table.id,
      table.sourceInstanceId,
    ),
    unique("external_accounts_id_account_unique").on(
      table.id,
      table.accountId,
    ),
    index("external_accounts_account_idx").on(table.accountId),
    index("external_accounts_connection_idx").on(table.connectionId),
    foreignKey({
      columns: [table.connectionId, table.sourceInstanceId],
      foreignColumns: [connections.id, connections.sourceInstanceId],
      name: "external_accounts_connection_source_fk",
    }).onDelete("restrict"),
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
});

export const synchronizationRuns = defineModelTable({
  schema: ingestionSchema,
  name: "synchronization_runs",
  columns: {
    id: uuid("id").defaultRandom().notNull(),
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
    finishedAt: timestamp("finished_at", {
      mode: "date",
      withTimezone: true,
    }),
  },
  primaryKey: ["id"],
  writePolicy: "mutable-no-delete",
  immutableFields: ["sourceInstanceId", "actionId", "startedAt"],
  constraints: (table) => [
    unique("synchronization_runs_id_source_unique").on(
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
});

export const synchronizationConnectionResults = defineModelTable({
  schema: ingestionSchema,
  name: "synchronization_connection_results",
  columns: {
    id: uuid("id").defaultRandom().notNull(),
    sourceInstanceId: uuid("source_instance_id").notNull(),
    synchronizationRunId: uuid("synchronization_run_id").notNull(),
    connectionId: uuid("connection_id").notNull(),
    status: text("status").notNull(),
    reportedActive: boolean("reported_active").default(true).notNull(),
    reportedState: text("reported_state"),
    retryAfter: timestamp("retry_after", {
      mode: "date",
      withTimezone: true,
    }),
    sourceUpdatedAt: timestamp("source_updated_at", {
      mode: "date",
      withTimezone: true,
    }),
    errorKind: text("error_kind"),
    errorCode: text("error_code"),
    successfulAccountCount: integer("successful_account_count")
      .default(0)
      .notNull(),
    failedAccountCount: integer("failed_account_count").default(0).notNull(),
    finishedAt: timestamp("finished_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  primaryKey: ["id"],
  writePolicy: "append-only",
  constraints: (table) => [
    uniqueIndex("synchronization_connection_results_run_connection_unique").on(
      table.synchronizationRunId,
      table.connectionId,
    ),
    index("synchronization_connection_results_connection_finished_idx").on(
      table.connectionId,
      table.finishedAt,
    ),
    foreignKey({
      columns: [table.synchronizationRunId, table.sourceInstanceId],
      foreignColumns: [
        synchronizationRuns.id,
        synchronizationRuns.sourceInstanceId,
      ],
      name: "sync_connection_results_run_source_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.connectionId, table.sourceInstanceId],
      foreignColumns: [connections.id, connections.sourceInstanceId],
      name: "sync_connection_results_connection_source_fk",
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
});

export const externalAccountObservations = defineModelTable({
  schema: ingestionSchema,
  name: "external_account_observations",
  columns: {
    id: uuid("id").defaultRandom().notNull(),
    sourceInstanceId: uuid("source_instance_id").notNull(),
    synchronizationRunId: uuid("synchronization_run_id").notNull(),
    externalAccountId: uuid("external_account_id").notNull(),
    accountId: uuid("account_id").notNull(),
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
  primaryKey: ["id"],
  writePolicy: "append-only",
  constraints: (table) => [
    uniqueIndex("external_account_observations_run_account_unique").on(
      table.synchronizationRunId,
      table.externalAccountId,
    ),
    unique("external_account_observations_provenance_unique").on(
      table.id,
      table.synchronizationRunId,
      table.externalAccountId,
      table.sourceInstanceId,
    ),
    unique("external_account_observations_id_account_unique").on(
      table.id,
      table.accountId,
    ),
    index("external_account_observations_external_account_time_idx").on(
      table.externalAccountId,
      table.observedAt,
    ),
    foreignKey({
      columns: [table.synchronizationRunId, table.sourceInstanceId],
      foreignColumns: [
        synchronizationRuns.id,
        synchronizationRuns.sourceInstanceId,
      ],
      name: "external_account_observations_run_source_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.externalAccountId, table.sourceInstanceId],
      foreignColumns: [externalAccounts.id, externalAccounts.sourceInstanceId],
      name: "external_account_observations_account_source_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.externalAccountId, table.accountId],
      foreignColumns: [externalAccounts.id, externalAccounts.accountId],
      name: "external_account_observations_account_identity_fk",
    }).onDelete("restrict"),
    check(
      "external_account_observations_lifecycle_valid",
      sql`${table.reportedLifecycle} in ('active', 'disabled', 'deleted', 'unknown')`,
    ),
  ],
});

export const reportedAccountValuations = defineModelTable({
  schema: ingestionSchema,
  name: "reported_account_valuations",
  columns: {
    valuationCandidateId: uuid("valuation_candidate_id").notNull(),
    externalAccountObservationId: uuid(
      "external_account_observation_id",
    ).notNull(),
    accountId: uuid("account_id").notNull(),
    valuationBasis: text("valuation_basis").notNull(),
  },
  primaryKey: ["valuationCandidateId"],
  writePolicy: "append-only",
  constraints: (table) => [
    uniqueIndex("reported_account_valuations_observation_basis_unique").on(
      table.externalAccountObservationId,
      table.valuationBasis,
    ),
    foreignKey({
      columns: [table.valuationCandidateId, table.accountId],
      foreignColumns: [
        accountValuationCandidates.id,
        accountValuationCandidates.accountId,
      ],
      name: "reported_valuations_candidate_account_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.valuationCandidateId, table.valuationBasis],
      foreignColumns: [
        accountValuationCandidates.id,
        accountValuationCandidates.valuationBasis,
      ],
      name: "reported_valuations_candidate_basis_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.externalAccountObservationId, table.accountId],
      foreignColumns: [
        externalAccountObservations.id,
        externalAccountObservations.accountId,
      ],
      name: "reported_valuations_observation_account_fk",
    }).onDelete("restrict"),
  ],
});

export const synchronizationAccountResults = defineModelTable({
  schema: ingestionSchema,
  name: "synchronization_account_results",
  columns: {
    id: uuid("id").defaultRandom().notNull(),
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
  primaryKey: ["id"],
  writePolicy: "append-only",
  constraints: (table) => [
    uniqueIndex("synchronization_account_results_run_account_unique").on(
      table.synchronizationRunId,
      table.externalAccountId,
    ),
    index("synchronization_account_results_account_finished_idx").on(
      table.externalAccountId,
      table.finishedAt,
    ),
    foreignKey({
      columns: [table.synchronizationRunId, table.sourceInstanceId],
      foreignColumns: [
        synchronizationRuns.id,
        synchronizationRuns.sourceInstanceId,
      ],
      name: "sync_account_results_run_source_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.externalAccountId, table.sourceInstanceId],
      foreignColumns: [externalAccounts.id, externalAccounts.sourceInstanceId],
      name: "sync_account_results_external_account_source_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.externalAccountObservationId,
        table.synchronizationRunId,
        table.externalAccountId,
        table.sourceInstanceId,
      ],
      foreignColumns: [
        externalAccountObservations.id,
        externalAccountObservations.synchronizationRunId,
        externalAccountObservations.externalAccountId,
        externalAccountObservations.sourceInstanceId,
      ],
      name: "sync_account_results_observation_provenance_fk",
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
});

export const accountIdentityClaims = defineModelTable({
  schema: ingestionSchema,
  name: "account_identity_claims",
  columns: {
    id: uuid("id").defaultRandom().notNull(),
    externalAccountId: uuid("external_account_id").notNull(),
    claimType: text("claim_type").notNull(),
    keyVersion: text("key_version").notNull(),
    fingerprint: text("fingerprint").notNull(),
    isCurrent: boolean("is_current").default(true).notNull(),
    firstObservedRunId: uuid("first_observed_run_id").notNull(),
    lastObservedRunId: uuid("last_observed_run_id").notNull(),
    ...mutableTimestamps,
  },
  primaryKey: ["id"],
  writePolicy: "mutable-no-delete",
  immutableFields: [
    "externalAccountId",
    "claimType",
    "keyVersion",
    "fingerprint",
    "firstObservedRunId",
    "createdAt",
  ],
  constraints: (table) => [
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
});
