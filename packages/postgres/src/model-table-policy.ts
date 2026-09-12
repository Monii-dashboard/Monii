import { createHash } from "node:crypto";

import { getTableColumns, is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";

import {
  getModelTableDefinition,
  isModelTable,
  type ModelTable,
  type ModelTableWritePolicy,
} from "./model-table";

export const modelTablePolicyVersion = 1;
export const runtimeRoleName = "monii_runtime";

export type ModelTablePolicyTable = Readonly<{
  name: string;
  schema: string;
  primaryKey: readonly string[];
  writePolicy: ModelTableWritePolicy;
  immutableColumns: readonly string[];
}>;

export type ModelTablePolicySnapshot = Readonly<{
  version: typeof modelTablePolicyVersion;
  tables: readonly ModelTablePolicyTable[];
}>;

function qualifiedName(table: Pick<ModelTablePolicyTable, "name" | "schema">) {
  return `${table.schema}.${table.name}`;
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function qualifiedIdentifier(
  table: Pick<ModelTablePolicyTable, "name" | "schema">,
): string {
  return `${quoteIdentifier(table.schema)}.${quoteIdentifier(table.name)}`;
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function modelTablePolicyHash(
  snapshot: ModelTablePolicySnapshot,
): string {
  return hash(snapshot);
}

export function modelTablePolicyComment(table: ModelTablePolicyTable): string {
  return `monii:model-table:v${modelTablePolicyVersion}:${table.writePolicy}:${hash(table).slice(0, 16)}`;
}

export function describeModelTablePolicy(
  table: ModelTable,
): ModelTablePolicyTable {
  const drizzle = getTableConfig(table);
  if (!drizzle.schema) {
    throw new Error(`ModelTable ${drizzle.name} must use a named schema`);
  }
  const columns = getTableColumns(table) as Record<string, { name: string }>;
  const model = getModelTableDefinition(table);
  const columnName = (field: string): string => {
    const column = columns[field];
    if (!column) {
      throw new Error(
        `ModelTable ${drizzle.schema}.${drizzle.name} references unknown field ${field}`,
      );
    }
    return column.name;
  };

  return {
    name: drizzle.name,
    schema: drizzle.schema,
    primaryKey: model.primaryKey.map(columnName),
    writePolicy: model.writePolicy,
    immutableColumns: model.immutableFields.map(columnName),
  };
}

export function createModelTablePolicySnapshot(
  schema: Readonly<Record<string, unknown>>,
): ModelTablePolicySnapshot {
  const drizzleTables = Object.values(schema).filter((value) =>
    is(value, PgTable),
  );
  const unregistered = drizzleTables.filter((table) => !isModelTable(table));
  if (unregistered.length > 0) {
    throw new Error(
      `Every Drizzle table must be a ModelTable: ${unregistered
        .map((table) => getTableConfig(table).name)
        .sort()
        .join(", ")}`,
    );
  }
  const tables = (drizzleTables as ModelTable[])
    .map(describeModelTablePolicy)
    .sort((left, right) =>
      qualifiedName(left).localeCompare(qualifiedName(right)),
    );
  const names = tables.map(qualifiedName);
  if (new Set(names).size !== names.length) {
    throw new Error("ModelTable qualified names must be unique");
  }
  return { version: modelTablePolicyVersion, tables };
}

function runtimePrivileges(policy: ModelTableWritePolicy): string[] {
  const privileges = ["SELECT"];
  if (policy !== "read-only") privileges.push("INSERT");
  if (policy === "full-crud" || policy === "mutable-no-delete") {
    privileges.push("UPDATE");
  }
  if (policy === "full-crud") privileges.push("DELETE");
  return privileges;
}

function rejectedEvents(policy: ModelTableWritePolicy): string[] {
  switch (policy) {
    case "read-only":
      return ["INSERT", "UPDATE", "DELETE", "TRUNCATE"];
    case "append-only":
      return ["UPDATE", "DELETE", "TRUNCATE"];
    case "mutable-no-delete":
      return ["DELETE", "TRUNCATE"];
    case "full-crud":
      return ["TRUNCATE"];
  }
}

function renderPolicyTable(table: ModelTablePolicyTable): string[] {
  const qualified = qualifiedIdentifier(table);
  const privileges = runtimePrivileges(table.writePolicy).join(", ");
  const statements = [
    `REVOKE ALL PRIVILEGES ON TABLE ${qualified} FROM ${quoteIdentifier(runtimeRoleName)};`,
    `GRANT ${privileges} ON TABLE ${qualified} TO ${quoteIdentifier(runtimeRoleName)};`,
    `COMMENT ON TABLE ${qualified} IS ${quoteLiteral(modelTablePolicyComment(table))};`,
    `DROP TRIGGER IF EXISTS monii_append_only_guard ON ${qualified};`,
    `DROP TRIGGER IF EXISTS monii_no_delete_guard ON ${qualified};`,
    `DROP TRIGGER IF EXISTS monii_synchronization_run_transition_guard ON ${qualified};`,
    `DROP TRIGGER IF EXISTS monii_model_table_write_guard ON ${qualified};`,
    `DROP TRIGGER IF EXISTS monii_model_table_lifecycle_guard ON ${qualified};`,
    `DROP TRIGGER IF EXISTS monii_model_table_immutable_guard ON ${qualified};`,
    `CREATE TRIGGER monii_model_table_write_guard\nBEFORE ${rejectedEvents(
      table.writePolicy,
    ).join(
      " OR ",
    )} ON ${qualified}\nFOR EACH STATEMENT EXECUTE FUNCTION public.monii_reject_table_mutation();`,
  ];

  if (
    table.writePolicy === "full-crud" ||
    table.writePolicy === "mutable-no-delete"
  ) {
    statements.push(
      `CREATE TRIGGER monii_model_table_immutable_guard\nBEFORE UPDATE ON ${qualified}\nFOR EACH ROW EXECUTE FUNCTION public.monii_reject_immutable_field_update(${quoteLiteral(JSON.stringify(table.immutableColumns))});`,
    );
  }
  return statements;
}

export function renderModelTablePolicyMigration(
  snapshot: ModelTablePolicySnapshot,
): string {
  const schemas = [...new Set(snapshot.tables.map((table) => table.schema))]
    .sort()
    .map(quoteIdentifier)
    .join(", ");
  const statements = [
    `DO $$
BEGIN
  CREATE ROLE ${quoteIdentifier(runtimeRoleName)}
    NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;`,
    `ALTER ROLE ${quoteIdentifier(runtimeRoleName)}
  NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;`,
    `GRANT ${quoteIdentifier(runtimeRoleName)} TO CURRENT_USER;`,
    `GRANT USAGE ON SCHEMA ${schemas} TO ${quoteIdentifier(runtimeRoleName)};`,
    `CREATE OR REPLACE FUNCTION public.monii_reject_table_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION '% is not permitted on %.%', TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = '55000';
END
$$;`,
    `REVOKE ALL ON FUNCTION public.monii_reject_table_mutation() FROM PUBLIC;`,
    `CREATE OR REPLACE FUNCTION public.monii_reject_immutable_field_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
  immutable_column text;
BEGIN
  FOR immutable_column IN
    SELECT jsonb_array_elements_text(TG_ARGV[0]::jsonb)
  LOOP
    IF (to_jsonb(OLD) -> immutable_column) IS DISTINCT FROM
       (to_jsonb(NEW) -> immutable_column)
    THEN
      RAISE EXCEPTION 'immutable field % cannot be updated on %.%', immutable_column, TG_TABLE_SCHEMA, TG_TABLE_NAME
        USING ERRCODE = '55000';
    END IF;
  END LOOP;

  RETURN NEW;
END
$$;`,
    `REVOKE ALL ON FUNCTION public.monii_reject_immutable_field_update() FROM PUBLIC;`,
    ...snapshot.tables.flatMap(renderPolicyTable),
    `DROP FUNCTION IF EXISTS public.monii_validate_lifecycle_transition();`,
    `DROP FUNCTION IF EXISTS public.monii_validate_synchronization_run_transition();`,
  ];

  return `-- Generated from ModelTable declarations. Do not edit by hand.
-- monii-model-table-policy-sha256:${modelTablePolicyHash(snapshot)}
${statements.join("\n--> statement-breakpoint\n")}\n`;
}
