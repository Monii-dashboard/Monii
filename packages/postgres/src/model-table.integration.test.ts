import { expect, it } from "@testkit/integration";
import { getIntegrationDatabase } from "@testkit/postgres";
import { eq, getTableColumns, is, sql } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";

import { getDatabase } from "./client";
import {
  getModelTableDefinition,
  isModelTable,
  type ModelTable,
  type ModelTableWritePolicy,
} from "./model-table";
import {
  describeModelTablePolicy,
  modelTablePolicyComment,
} from "./model-table-policy";
import * as schema from "./schema";
import { accounts, accountValuationCandidates } from "./schema/financial";
import { sourceInstances, synchronizationRuns } from "./schema/ingestion";

function modelTables(): ModelTable[] {
  const drizzleTables = Object.values(schema).filter((value) =>
    is(value, PgTable),
  );
  const unregistered = drizzleTables.filter((table) => !isModelTable(table));
  expect(unregistered.map((table) => getTableConfig(table).name)).toEqual([]);
  return drizzleTables as ModelTable[];
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

it("registers every Drizzle table with its primary key and write policy", () => {
  const tables = modelTables();
  expect(tables).toHaveLength(18);
  expect(
    tables.map((table) => {
      const drizzle = getTableConfig(table);
      const model = getModelTableDefinition(table);
      return {
        name: `${drizzle.schema}.${drizzle.name}`,
        primaryKey: model.primaryKey,
        writePolicy: model.writePolicy,
      };
    }),
  ).toContainEqual({
    name: "wealth.snapshot_account_decisions",
    primaryKey: ["snapshotId", "accountId"],
    writePolicy: "append-only",
  });
});

it("installs matching primary keys, guards, and runtime privileges", async () => {
  const admin = getIntegrationDatabase();
  const runtime = getDatabase();
  const [identity] = await runtime.execute<{
    currentRole: string;
    sessionUser: string;
  }>(sql`
    select current_role as "currentRole", session_user as "sessionUser"
  `);
  expect(identity).toMatchObject({ currentRole: "monii_runtime" });
  expect(identity?.sessionUser).not.toBe("monii_runtime");
  const [runtimeRole] = await admin.execute<{
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
    where rolname = 'monii_runtime'
  `);
  expect(runtimeRole).toEqual({
    canBypassRls: false,
    canCreateDatabase: false,
    canCreateRole: false,
    canLogin: false,
    inherits: false,
    isReplicationRole: false,
    isSuperuser: false,
  });

  const triggers = await admin.execute<{
    definition: string;
    name: string;
    trigger: string;
  }>(sql`
    select
      n.nspname || '.' || c.relname as name,
      t.tgname as trigger,
      pg_get_triggerdef(t.oid) as definition
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal
  `);
  const triggersByName = new Map(
    triggers.map(({ definition, name, trigger }) => [
      `${name}:${trigger}`,
      definition,
    ]),
  );
  const databasePrimaryKeys = await admin.execute<{
    columns: string[];
    name: string;
  }>(sql`
    select
      n.nspname || '.' || c.relname as name,
      array_agg(a.attname order by key.ordinality) as columns
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral unnest(con.conkey)
      with ordinality as key(attnum, ordinality)
    join pg_attribute a
      on a.attrelid = c.oid
      and a.attnum = key.attnum
    where con.contype = 'p'
    group by n.nspname, c.relname
  `);
  const primaryKeysByTable = new Map(
    databasePrimaryKeys.map(({ columns, name }) => [name, columns]),
  );

  for (const table of modelTables()) {
    const drizzle = getTableConfig(table);
    const { immutableFields, primaryKey, writePolicy } =
      getModelTableDefinition(table);
    const qualifiedName = `${drizzle.schema}.${drizzle.name}`;
    const drizzleColumns = getTableColumns(table) as Record<
      string,
      { name: string }
    >;
    expect(primaryKeysByTable.get(qualifiedName), qualifiedName).toEqual(
      primaryKey.map((field) => drizzleColumns[field]?.name),
    );
    const [privileges] = await admin.execute<{
      canDelete: boolean;
      canInsert: boolean;
      canSelect: boolean;
      canTruncate: boolean;
      canUpdate: boolean;
      policyComment: string | null;
    }>(sql`
      select
        has_table_privilege('monii_runtime', ${qualifiedName}, 'SELECT') as "canSelect",
        has_table_privilege('monii_runtime', ${qualifiedName}, 'INSERT') as "canInsert",
        has_table_privilege('monii_runtime', ${qualifiedName}, 'UPDATE') as "canUpdate",
        has_table_privilege('monii_runtime', ${qualifiedName}, 'DELETE') as "canDelete",
        has_table_privilege('monii_runtime', ${qualifiedName}, 'TRUNCATE') as "canTruncate",
        obj_description(${qualifiedName}::regclass, 'pg_class') as "policyComment"
    `);
    expect(privileges, qualifiedName).toEqual({
      canDelete: writePolicy === "full-crud",
      canInsert: writePolicy !== "read-only",
      canSelect: true,
      canTruncate: false,
      canUpdate:
        writePolicy === "full-crud" || writePolicy === "mutable-no-delete",
      policyComment: modelTablePolicyComment(describeModelTablePolicy(table)),
    });

    const writeGuard = triggersByName.get(
      `${qualifiedName}:monii_model_table_write_guard`,
    );
    expect(writeGuard, qualifiedName).toBeDefined();
    for (const event of rejectedEvents(writePolicy)) {
      expect(writeGuard, `${qualifiedName}:${event}`).toContain(event);
    }
    const updateCapable =
      writePolicy === "full-crud" || writePolicy === "mutable-no-delete";
    expect(
      triggersByName.has(`${qualifiedName}:monii_model_table_immutable_guard`),
      qualifiedName,
    ).toBe(updateCapable);
    if (updateCapable) {
      const immutableColumns = immutableFields.map(
        (field) => drizzleColumns[field]?.name,
      );
      expect(
        triggersByName.get(
          `${qualifiedName}:monii_model_table_immutable_guard`,
        ),
        qualifiedName,
      ).toContain(JSON.stringify(immutableColumns));
    }
  }
  expect(
    triggersByName
      .get("ingestion.synchronization_runs:monii_model_table_immutable_guard")
      ?.includes(`'["id","source_instance_id","action_id","started_at"]'`),
  ).toBe(true);
});

it("rejects direct mutation of append-only records for runtime and owner connections", async () => {
  const admin = getIntegrationDatabase();
  const runtime = getDatabase();
  const [account] = await runtime
    .insert(accounts)
    .values({
      category: "cash",
      purpose: "personal",
    })
    .returning();
  if (!account) throw new Error("Expected account");
  const [candidate] = await runtime
    .insert(accountValuationCandidates)
    .values({
      accountId: account.id,
      amount: "42",
      currency: "EUR",
      valuationBasis: "balance",
      valuationMethod: "reported",
    })
    .returning();
  if (!candidate) throw new Error("Expected candidate");

  await expect(
    runtime
      .update(accountValuationCandidates)
      .set({ amount: "43" })
      .where(sql`${accountValuationCandidates.id} = ${candidate.id}`),
  ).rejects.toMatchObject({ cause: { code: "42501" } });
  await expect(
    admin
      .update(accountValuationCandidates)
      .set({ amount: "43" })
      .where(sql`${accountValuationCandidates.id} = ${candidate.id}`),
  ).rejects.toMatchObject({ cause: { code: "55000" } });
  await expect(
    admin.execute(sql`truncate wealth.snapshot_account_decisions`),
  ).rejects.toMatchObject({ cause: { code: "55000" } });
});

it("allows updates but rejects deletion for mutable no-delete records", async () => {
  const admin = getIntegrationDatabase();
  const runtime = getDatabase();
  const [account] = await runtime
    .insert(accounts)
    .values({
      category: "cash",
      purpose: "personal",
    })
    .returning();
  if (!account) throw new Error("Expected account");

  await expect(
    runtime
      .update(accounts)
      .set({ name: "Updated" })
      .where(eq(accounts.id, account.id))
      .returning({ name: accounts.name }),
  ).resolves.toEqual([{ name: "Updated" }]);
  await expect(
    runtime.delete(accounts).where(eq(accounts.id, account.id)),
  ).rejects.toMatchObject({ cause: { code: "42501" } });
  await expect(
    admin.delete(accounts).where(eq(accounts.id, account.id)),
  ).rejects.toMatchObject({ cause: { code: "55000" } });
});

it("allows synchronization updates but rejects immutable-field changes", async () => {
  const runtime = getDatabase();
  const [source] = await runtime
    .insert(sourceInstances)
    .values({
      adapterKey: "test",
      name: "Lifecycle source",
      sourceKey: "lifecycle-source",
    })
    .returning();
  if (!source) throw new Error("Expected source");
  const [run] = await runtime
    .insert(synchronizationRuns)
    .values({
      actionId: "lifecycle-run",
      sourceInstanceId: source.id,
    })
    .returning();
  if (!run) throw new Error("Expected run");

  await expect(
    runtime
      .update(synchronizationRuns)
      .set({ finishedAt: new Date(), status: "succeeded" })
      .where(eq(synchronizationRuns.id, run.id))
      .returning({ status: synchronizationRuns.status }),
  ).resolves.toEqual([{ status: "succeeded" }]);
  await expect(
    runtime
      .update(synchronizationRuns)
      .set({ actionId: "changed" })
      .where(eq(synchronizationRuns.id, run.id)),
  ).rejects.toMatchObject({ cause: { code: "55000" } });
});
