import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  numeric,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { accounts, accountValuationCandidates, institutions } from "./financial";
import { synchronizationRuns } from "./ingestion";
import { wealthSchema } from "./namespaces";

export const accountPolicies = wealthSchema.table(
  "account_policies",
  {
    accountId: uuid("account_id")
      .primaryKey()
      .references(() => accounts.id, { onDelete: "restrict" }),
    inclusionPolicy: text("inclusion_policy").default("automatic").notNull(),
    selectedValuationMethod: text("selected_valuation_method")
      .default("reported")
      .notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "account_policies_inclusion_valid",
      sql`${table.inclusionPolicy} in ('automatic', 'include', 'exclude')`,
    ),
    check(
      "account_policies_valuation_method_valid",
      sql`${table.selectedValuationMethod} = 'reported'`,
    ),
  ],
);

export const snapshots = wealthSchema.table(
  "snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reason: text("reason").notNull(),
    causationId: uuid("causation_id").notNull(),
    actionId: text("action_id").notNull(),
    synchronizationRunId: uuid("synchronization_run_id").references(
      () => synchronizationRuns.id,
      { onDelete: "restrict" },
    ),
    calculationPolicyVersion: text("calculation_policy_version")
      .default("v1")
      .notNull(),
    reportingCurrency: text("reporting_currency").default("EUR").notNull(),
    headlineAmount: numeric("headline_amount", { precision: 24, scale: 8 }).notNull(),
    duplicateAdjustedEstimateAmount: numeric("duplicate_adjusted_estimate_amount", {
      precision: 24,
      scale: 8,
    }).notNull(),
    likelyDuplicateGroupCount: integer("likely_duplicate_group_count")
      .default(0)
      .notNull(),
    isComplete: boolean("is_complete").notNull(),
    contributingAccountCount: integer("contributing_account_count").notNull(),
    missingAccountCount: integer("missing_account_count").notNull(),
    recordedAt: timestamp("recorded_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("snapshots_causation_unique").on(table.causationId),
    uniqueIndex("snapshots_synchronization_run_unique")
      .on(table.synchronizationRunId)
      .where(sql`${table.synchronizationRunId} is not null`),
    index("snapshots_recorded_idx").on(table.recordedAt),
    check(
      "snapshots_reason_valid",
      sql`${table.reason} in ('synchronization', 'account_policy_changed', 'account_reconciliation')`,
    ),
    check(
      "snapshots_reason_shape_valid",
      sql`(${table.reason} = 'synchronization' and ${table.synchronizationRunId} is not null) or (${table.reason} in ('account_policy_changed', 'account_reconciliation') and ${table.synchronizationRunId} is null)`,
    ),
    check(
      "snapshots_reporting_currency_valid",
      sql`${table.reportingCurrency} ~ '^[A-Z]{3}$'`,
    ),
    check(
      "snapshots_counts_nonnegative",
      sql`${table.contributingAccountCount} >= 0 and ${table.missingAccountCount} >= 0 and ${table.likelyDuplicateGroupCount} >= 0`,
    ),
  ],
);

export const snapshotAccountDecisions = wealthSchema.table(
  "snapshot_account_decisions",
  {
    snapshotId: uuid("snapshot_id")
      .notNull()
      .references(() => snapshots.id, { onDelete: "restrict" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    accountName: text("account_name"),
    institutionId: uuid("institution_id").references(() => institutions.id, {
      onDelete: "restrict",
    }),
    institutionName: text("institution_name"),
    accountCategory: text("account_category").notNull(),
    accountPurpose: text("account_purpose").notNull(),
    accountManagementMode: text("account_management_mode").notNull(),
    inclusionPolicy: text("inclusion_policy").notNull(),
    selectedValuationMethod: text("selected_valuation_method").notNull(),
    selectedValuationBasis: text("selected_valuation_basis"),
    evaluatedValuationCandidateId: uuid("evaluated_valuation_candidate_id"),
    evaluatedAmount: numeric("evaluated_amount", { precision: 24, scale: 8 }),
    evaluatedCurrency: text("evaluated_currency"),
    selectedValuationEffectiveAt: timestamp("selected_valuation_effective_at", {
      mode: "date",
      withTimezone: true,
    }),
    selectedValuationRecordedAt: timestamp("selected_valuation_recorded_at", {
      mode: "date",
      withTimezone: true,
    }),
    latestDataRecordedAt: timestamp("latest_data_recorded_at", {
      mode: "date",
      withTimezone: true,
    }),
    decision: text("decision").notNull(),
    contributedAmount: numeric("contributed_amount", { precision: 24, scale: 8 }),
    duplicateAdjustedAmount: numeric("duplicate_adjusted_amount", {
      precision: 24,
      scale: 8,
    }),
    duplicateGroupId: uuid("duplicate_group_id"),
    duplicateRole: text("duplicate_role").default("none").notNull(),
    identityConflict: boolean("identity_conflict").default(false).notNull(),
    refreshUncertain: boolean("refresh_uncertain").default(false).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.snapshotId, table.accountId] }),
    index("snapshot_account_decisions_account_idx").on(table.accountId),
    index("snapshot_account_decisions_candidate_idx").on(
      table.evaluatedValuationCandidateId,
    ),
    foreignKey({
      columns: [table.evaluatedValuationCandidateId],
      foreignColumns: [accountValuationCandidates.id],
      name: "snapshot_decisions_valuation_candidate_fk",
    }).onDelete("restrict"),
    check(
      "snapshot_account_decisions_decision_valid",
      sql`${table.decision} in ('included', 'excluded_by_policy', 'excluded_business', 'excluded_external_lifecycle', 'excluded_archived', 'excluded_merged', 'missing_selected_valuation', 'unknown_account_category', 'known_unsupported_account', 'missing_currency', 'unsupported_currency')`,
    ),
    check(
      "snapshot_account_decisions_category_valid",
      sql`${table.accountCategory} in ('cash', 'investment', 'unknown')`,
    ),
    check(
      "snapshot_account_decisions_purpose_valid",
      sql`${table.accountPurpose} in ('personal', 'business', 'unknown')`,
    ),
    check(
      "snapshot_account_decisions_management_mode_valid",
      sql`${table.accountManagementMode} = 'external'`,
    ),
    check(
      "snapshot_account_decisions_inclusion_valid",
      sql`${table.inclusionPolicy} in ('automatic', 'include', 'exclude')`,
    ),
    check(
      "snapshot_account_decisions_method_valid",
      sql`${table.selectedValuationMethod} = 'reported'`,
    ),
    check(
      "snapshot_account_decisions_basis_valid",
      sql`${table.selectedValuationBasis} is null or ${table.selectedValuationBasis} in ('balance', 'estimated_value')`,
    ),
    check(
      "snapshot_account_decisions_currency_valid",
      sql`${table.evaluatedCurrency} is null or ${table.evaluatedCurrency} ~ '^[A-Z]{3}$'`,
    ),
    check(
      "snapshot_account_decisions_contribution_shape_valid",
      sql`(${table.decision} = 'included' and ${table.contributedAmount} is not null and ${table.evaluatedValuationCandidateId} is not null) or (${table.decision} <> 'included' and ${table.contributedAmount} is null)`,
    ),
  ],
);
