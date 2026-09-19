import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { defineModelTable } from "../model-table";
import { externalAccounts, synchronizationRuns } from "./ingestion";
import { reconciliationSchema } from "./namespaces";

export const accountMatchAssessments = defineModelTable({
  schema: reconciliationSchema,
  name: "account_match_assessments",
  columns: {
    id: uuid("id").defaultRandom().notNull(),
    leftExternalAccountId: uuid("left_external_account_id").notNull(),
    rightExternalAccountId: uuid("right_external_account_id").notNull(),
    classification: text("classification").notNull(),
    evidence: text("evidence").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    conflictDetectedAt: timestamp("conflict_detected_at", {
      mode: "date",
      withTimezone: true,
    }),
    firstDetectedSynchronizationRunId: uuid(
      "first_detected_synchronization_run_id",
    ),
    lastDetectedSynchronizationRunId: uuid(
      "last_detected_synchronization_run_id",
    ),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  primaryKey: ["id"],
  writePolicy: "mutable-no-delete",
  immutableFields: [
    "leftExternalAccountId",
    "rightExternalAccountId",
    "firstDetectedSynchronizationRunId",
    "createdAt",
  ],
  constraints: (table) => [
    uniqueIndex("account_match_assessments_pair_unique").on(
      table.leftExternalAccountId,
      table.rightExternalAccountId,
    ),
    index("account_match_assessments_right_account_idx").on(
      table.rightExternalAccountId,
    ),
    foreignKey({
      columns: [table.leftExternalAccountId],
      foreignColumns: [externalAccounts.id],
      name: "account_matches_left_external_account_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.rightExternalAccountId],
      foreignColumns: [externalAccounts.id],
      name: "account_matches_right_external_account_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.firstDetectedSynchronizationRunId],
      foreignColumns: [synchronizationRuns.id],
      name: "account_matches_first_synchronization_run_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.lastDetectedSynchronizationRunId],
      foreignColumns: [synchronizationRuns.id],
      name: "account_matches_last_synchronization_run_fk",
    }).onDelete("restrict"),
    check(
      "account_match_assessments_ordered_pair",
      sql`${table.leftExternalAccountId}::text < ${table.rightExternalAccountId}::text`,
    ),
    check(
      "account_match_assessments_classification_valid",
      sql`${table.classification} in ('confirmed_duplicate', 'likely_duplicate', 'dismissed')`,
    ),
  ],
});
