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

function expectedTrigger(policy: ModelTableWritePolicy): string | undefined {
  if (policy === "append-only" || policy === "read-only") {
    return "monii_append_only_guard";
  }
  if (policy === "controlled-lifecycle" || policy === "mutable-no-delete") {
    return "monii_no_delete_guard";
  }
  return undefined;
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

  const triggers = await admin.execute<{
    name: string;
    trigger: string;
  }>(sql`
    select
      n.nspname || '.' || c.relname as name,
      t.tgname as trigger
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal
  `);
  const triggerNames = new Set(
    triggers.map(({ name, trigger }) => `${name}:${trigger}`),
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
    const { primaryKey, writePolicy } = getModelTableDefinition(table);
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
        writePolicy === "controlled-lifecycle" ||
        writePolicy === "full-crud" ||
        writePolicy === "mutable-no-delete",
      policyComment: `monii:model-table:${writePolicy}`,
    });

    const guard = expectedTrigger(writePolicy);
    if (guard) {
      expect(triggerNames.has(`${qualifiedName}:${guard}`), qualifiedName).toBe(
        true,
      );
    }
  }
  expect(
    triggerNames.has(
      "ingestion.synchronization_runs:monii_synchronization_run_transition_guard",
    ),
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

it("allows only running-to-terminal synchronization lifecycle transitions", async () => {
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
      .set({ finishedAt: new Date(), status: "failed" })
      .where(eq(synchronizationRuns.id, run.id)),
  ).rejects.toMatchObject({ cause: { code: "55000" } });
});
