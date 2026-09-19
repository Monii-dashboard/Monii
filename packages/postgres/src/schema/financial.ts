import { sql } from "drizzle-orm";
import {
  check,
  index,
  numeric,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { defineModelTable } from "../model-table";
import { financialSchema } from "./namespaces";

const mutableTimestamps = {
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
    .defaultNow()
    .notNull(),
};

export const institutions = defineModelTable({
  schema: financialSchema,
  name: "institutions",
  columns: {
    id: uuid("id").defaultRandom().notNull(),
    name: text("name"),
    archivedAt: timestamp("archived_at", { mode: "date", withTimezone: true }),
    ...mutableTimestamps,
  },
  primaryKey: ["id"],
  writePolicy: "mutable-no-delete",
  immutableFields: ["createdAt"],
});

export const accounts = defineModelTable({
  schema: financialSchema,
  name: "accounts",
  columns: {
    id: uuid("id").defaultRandom().notNull(),
    institutionId: uuid("institution_id").references(() => institutions.id, {
      onDelete: "restrict",
    }),
    name: text("name"),
    category: text("category").notNull(),
    purpose: text("purpose").notNull(),
    managementMode: text("management_mode").default("external").notNull(),
    archivedAt: timestamp("archived_at", {
      mode: "date",
      withTimezone: true,
    }),
    ...mutableTimestamps,
  },
  primaryKey: ["id"],
  writePolicy: "mutable-no-delete",
  immutableFields: ["createdAt"],
  constraints: (table) => [
    index("accounts_institution_idx").on(table.institutionId),
    check(
      "accounts_category_valid",
      sql`${table.category} in ('cash', 'investment', 'unknown')`,
    ),
    check(
      "accounts_purpose_valid",
      sql`${table.purpose} in ('personal', 'business', 'unknown')`,
    ),
    check(
      "accounts_management_mode_valid",
      sql`${table.managementMode} = 'external'`,
    ),
  ],
});

export const accountMerges = defineModelTable({
  schema: financialSchema,
  name: "account_merges",
  columns: {
    mergedAccountId: uuid("merged_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    canonicalAccountId: uuid("canonical_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    reason: text("reason").notNull(),
    mergedAt: timestamp("merged_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  primaryKey: ["mergedAccountId"],
  writePolicy: "append-only",
  constraints: (table) => [
    index("account_merges_canonical_account_idx").on(table.canonicalAccountId),
    check(
      "account_merges_distinct_accounts",
      sql`${table.mergedAccountId} <> ${table.canonicalAccountId}`,
    ),
    check(
      "account_merges_reason_valid",
      sql`${table.reason} in ('confirmed_external_identity', 'operator_confirmed')`,
    ),
  ],
});

export const accountValuationCandidates = defineModelTable({
  schema: financialSchema,
  name: "account_valuation_candidates",
  columns: {
    id: uuid("id").defaultRandom().notNull(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    valuationMethod: text("valuation_method").notNull(),
    valuationBasis: text("valuation_basis").notNull(),
    amount: numeric("amount", { precision: 24, scale: 8 }).notNull(),
    currency: text("currency"),
    effectiveAt: timestamp("effective_at", {
      mode: "date",
      withTimezone: true,
    }),
    recordedAt: timestamp("recorded_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  primaryKey: ["id"],
  writePolicy: "append-only",
  constraints: (table) => [
    unique("account_valuation_candidates_id_account_unique").on(
      table.id,
      table.accountId,
    ),
    unique("account_valuation_candidates_id_basis_unique").on(
      table.id,
      table.valuationBasis,
    ),
    index("account_valuation_candidates_selection_idx").on(
      table.accountId.asc(),
      table.valuationMethod.asc(),
      table.valuationBasis.asc(),
      sql`coalesce(${table.effectiveAt}, ${table.recordedAt}) desc`,
      table.recordedAt.desc(),
      table.id.desc(),
    ),
    check(
      "account_valuation_candidates_method_valid",
      sql`${table.valuationMethod} = 'reported'`,
    ),
    check(
      "account_valuation_candidates_basis_valid",
      sql`${table.valuationBasis} in ('balance', 'estimated_value')`,
    ),
    check(
      "account_valuation_candidates_currency_valid",
      sql`${table.currency} is null or ${table.currency} ~ '^[A-Z]{3}$'`,
    ),
  ],
});
