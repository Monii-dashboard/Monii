import { sql } from "drizzle-orm";

import type { Database } from "./client";
import {
  modelTablePolicyComment,
  modelTableRuntimePrivileges,
  rejectedModelTableEvents,
  runtimeRoleName,
  type ModelTablePolicySnapshot,
  type ModelTablePolicyTable,
} from "./model-table-policy";

const privileges = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"];
const legacyManagedTriggers = [
  "monii_append_only_guard",
  "monii_no_delete_guard",
  "monii_synchronization_run_transition_guard",
  "monii_model_table_lifecycle_guard",
];

type CatalogTrigger = Readonly<{
  arguments: string;
  before: boolean;
  enabled: string;
  functionName: string;
  functionSchema: string;
  onDelete: boolean;
  onInsert: boolean;
  onTruncate: boolean;
  onUpdate: boolean;
  rowLevel: boolean;
  triggerName: string;
}>;

function qualifiedName(table: ModelTablePolicyTable): string {
  return `${table.schema}.${table.name}`;
}

function triggerEvents(trigger: CatalogTrigger): string[] {
  return [
    trigger.onInsert ? "INSERT" : undefined,
    trigger.onUpdate ? "UPDATE" : undefined,
    trigger.onDelete ? "DELETE" : undefined,
    trigger.onTruncate ? "TRUNCATE" : undefined,
  ].filter((event): event is string => event !== undefined);
}

async function verifyRuntimeRole(database: Database): Promise<string[]> {
  const [role] = await database.execute<{
    canBypassRls: boolean;
    canCreateDatabase: boolean;
    canCreateRole: boolean;
    canLogin: boolean;
    inherits: boolean;
    isReplicationRole: boolean;
    isSuperuser: boolean;
  }>(sql`
    select
      rolbypassrls as "canBypassRls",
      rolcreatedb as "canCreateDatabase",
      rolcreaterole as "canCreateRole",
      rolcanlogin as "canLogin",
      rolinherit as inherits,
      rolreplication as "isReplicationRole",
      rolsuper as "isSuperuser"
    from pg_roles
    where rolname = ${runtimeRoleName}
  `);
  if (!role) return [`runtime role ${runtimeRoleName} does not exist`];

  const insecureAttributes = Object.entries(role)
    .filter(([, enabled]) => enabled)
    .map(([attribute]) => attribute);
  return insecureAttributes.length === 0
    ? []
    : [
        `runtime role ${runtimeRoleName} has insecure attributes: ${insecureAttributes.join(", ")}`,
      ];
}

async function verifyTable(
  database: Database,
  table: ModelTablePolicyTable,
): Promise<string[]> {
  const errors: string[] = [];
  const qualified = qualifiedName(table);
  const [relation] = await database.execute<{ exists: boolean }>(sql`
    select to_regclass(${qualified}) is not null as exists
  `);
  if (!relation?.exists) return [`ModelTable ${qualified} does not exist`];

  const [metadata] = await database.execute<{
    policyComment: string | null;
    primaryKey: string[] | null;
  }>(sql`
    select
      obj_description(c.oid, 'pg_class') as "policyComment",
      (
        select array_agg(a.attname order by key.ordinality)
        from pg_constraint con
        cross join lateral unnest(con.conkey)
          with ordinality as key(attnum, ordinality)
        join pg_attribute a
          on a.attrelid = con.conrelid
          and a.attnum = key.attnum
        where con.conrelid = c.oid and con.contype = 'p'
      ) as "primaryKey"
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = ${table.schema} and c.relname = ${table.name}
  `);
  if (JSON.stringify(metadata?.primaryKey) !== JSON.stringify(table.primaryKey)) {
    errors.push(
      `${qualified} primary key is ${JSON.stringify(metadata?.primaryKey)}; expected ${JSON.stringify(table.primaryKey)}`,
    );
  }
  const expectedComment = modelTablePolicyComment(table);
  if (metadata?.policyComment !== expectedComment) {
    errors.push(
      `${qualified} policy comment is ${JSON.stringify(metadata?.policyComment)}; expected ${JSON.stringify(expectedComment)}`,
    );
  }

  const [actualPrivileges] = await database.execute<
    Record<(typeof privileges)[number], boolean>
  >(sql`
    select
      has_table_privilege(${runtimeRoleName}, ${qualified}, 'SELECT') as "SELECT",
      has_table_privilege(${runtimeRoleName}, ${qualified}, 'INSERT') as "INSERT",
      has_table_privilege(${runtimeRoleName}, ${qualified}, 'UPDATE') as "UPDATE",
      has_table_privilege(${runtimeRoleName}, ${qualified}, 'DELETE') as "DELETE",
      has_table_privilege(${runtimeRoleName}, ${qualified}, 'TRUNCATE') as "TRUNCATE"
  `);
  const expectedPrivileges = new Set(
    modelTableRuntimePrivileges(table.writePolicy),
  );
  for (const privilege of privileges) {
    if (actualPrivileges?.[privilege] !== expectedPrivileges.has(privilege)) {
      errors.push(
        `${qualified} ${privilege} privilege is ${actualPrivileges?.[privilege] ?? "missing"}; expected ${expectedPrivileges.has(privilege)}`,
      );
    }
  }

  const triggers = await database.execute<CatalogTrigger>(sql`
    select
      encode(t.tgargs, 'escape') as arguments,
      (t.tgtype & 2) <> 0 as before,
      t.tgenabled as enabled,
      p.proname as "functionName",
      pn.nspname as "functionSchema",
      (t.tgtype & 8) <> 0 as "onDelete",
      (t.tgtype & 4) <> 0 as "onInsert",
      (t.tgtype & 32) <> 0 as "onTruncate",
      (t.tgtype & 16) <> 0 as "onUpdate",
      (t.tgtype & 1) <> 0 as "rowLevel",
      t.tgname as "triggerName"
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
    join pg_namespace pn on pn.oid = p.pronamespace
    where
      not t.tgisinternal
      and n.nspname = ${table.schema}
      and c.relname = ${table.name}
  `);
  const writeGuards = triggers.filter(
    ({ triggerName }) => triggerName === "monii_model_table_write_guard",
  );
  const expectedRejectedEvents = rejectedModelTableEvents(table.writePolicy);
  if (
    writeGuards.length !== 1 ||
    !writeGuards[0]?.before ||
    writeGuards[0].enabled !== "O" ||
    writeGuards[0].functionSchema !== "public" ||
    writeGuards[0].functionName !== "monii_reject_table_mutation" ||
    writeGuards[0].rowLevel ||
    JSON.stringify(triggerEvents(writeGuards[0])) !==
      JSON.stringify(expectedRejectedEvents)
  ) {
    errors.push(
      `${qualified} write guard does not match rejected events ${expectedRejectedEvents.join(", ")}`,
    );
  }

  const immutableGuards = triggers.filter(
    ({ triggerName }) => triggerName === "monii_model_table_immutable_guard",
  );
  const updateCapable =
    table.writePolicy === "full-crud" ||
    table.writePolicy === "mutable-no-delete";
  if (!updateCapable && immutableGuards.length !== 0) {
    errors.push(`${qualified} unexpectedly has an immutable-field guard`);
  }
  if (updateCapable) {
    const immutableGuard = immutableGuards[0];
    const arguments_ = immutableGuard?.arguments.replace(/\\000$/, "");
    if (
      immutableGuards.length !== 1 ||
      !immutableGuard?.before ||
      immutableGuard.enabled !== "O" ||
      immutableGuard.functionSchema !== "public" ||
      immutableGuard.functionName !==
        "monii_reject_immutable_field_update" ||
      !immutableGuard.rowLevel ||
      JSON.stringify(triggerEvents(immutableGuard)) !==
        JSON.stringify(["UPDATE"]) ||
      arguments_ !== JSON.stringify(table.immutableColumns)
    ) {
      errors.push(
        `${qualified} immutable-field guard does not match ${JSON.stringify(table.immutableColumns)}`,
      );
    }
  }

  for (const trigger of legacyManagedTriggers) {
    if (triggers.some(({ triggerName }) => triggerName === trigger)) {
      errors.push(`${qualified} retains legacy trigger ${trigger}`);
    }
  }
  return errors;
}

export async function verifyModelTablePolicyCatalog(
  database: Database,
  snapshot: ModelTablePolicySnapshot,
): Promise<string[]> {
  const errors = await verifyRuntimeRole(database);
  if (errors.length > 0) return errors;
  for (const schema of new Set(snapshot.tables.map((table) => table.schema))) {
    const [privilege] = await database.execute<{ canUse: boolean }>(sql`
      select has_schema_privilege(
        ${runtimeRoleName},
        ${schema},
        'USAGE'
      ) as "canUse"
    `);
    if (!privilege?.canUse) {
      errors.push(`${runtimeRoleName} lacks USAGE on schema ${schema}`);
    }
  }
  for (const table of snapshot.tables) {
    errors.push(...(await verifyTable(database, table)));
  }
  return errors;
}
