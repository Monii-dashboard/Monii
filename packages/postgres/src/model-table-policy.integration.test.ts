import { expect, it } from "@testkit/integration";
import { getIntegrationDatabase } from "@testkit/postgres";
import { sql } from "drizzle-orm";
import { integer, pgSchema, text } from "drizzle-orm/pg-core";

import { getDatabase } from "./client";
import { defineModelTable } from "./model-table";
import {
  createModelTablePolicySnapshot,
  renderModelTablePolicyMigration,
} from "./model-table-policy";

const policySchema = pgSchema("model_policy_runtime_test");
const policyTables = {
  appendOnly: defineModelTable({
    schema: policySchema,
    name: "append_only",
    columns: { id: integer("id").notNull(), value: text("value") },
    primaryKey: ["id"],
    writePolicy: "append-only",
  }),
  fullCrud: defineModelTable({
    schema: policySchema,
    name: "full_crud",
    columns: { id: integer("id").notNull(), value: text("value") },
    primaryKey: ["id"],
    writePolicy: "full-crud",
    immutableFields: [],
  }),
  mutableNoDelete: defineModelTable({
    schema: policySchema,
    name: "mutable_no_delete",
    columns: {
      id: integer("id").notNull(),
      immutableValue: text("immutable_value"),
      value: text("value"),
    },
    primaryKey: ["id"],
    writePolicy: "mutable-no-delete",
    immutableFields: ["immutableValue"],
  }),
  readOnly: defineModelTable({
    schema: policySchema,
    name: "read_only",
    columns: { id: integer("id").notNull(), value: text("value") },
    primaryKey: ["id"],
    writePolicy: "read-only",
  }),
};

async function applyPolicies(
  tables: Readonly<Record<string, unknown>>,
): Promise<void> {
  const admin = getIntegrationDatabase();
  const migration = renderModelTablePolicyMigration(
    createModelTablePolicySnapshot(tables),
  );
  for (const statement of migration.split("\n--> statement-breakpoint\n")) {
    await admin.execute(sql.raw(statement));
  }
}

async function installTestPolicies(): Promise<void> {
  const admin = getIntegrationDatabase();
  await admin.execute(sql`create schema model_policy_runtime_test`);
  for (const table of [
    "append_only",
    "full_crud",
    "mutable_no_delete",
    "read_only",
  ]) {
    await admin.execute(
      sql.raw(
        `create table model_policy_runtime_test.${table} (id integer primary key, immutable_value text, value text)`,
      ),
    );
  }
  await admin.execute(sql`
    insert into model_policy_runtime_test.read_only (id, value)
    values (1, 'seeded')
  `);

  await applyPolicies(policyTables);
}

it("enforces every ModelTable policy against runtime and owner writes", async () => {
  await installTestPolicies();
  const admin = getIntegrationDatabase();
  const runtime = getDatabase();

  await expect(
    runtime.execute(sql`
      select value from model_policy_runtime_test.read_only where id = 1
    `),
  ).resolves.toHaveLength(1);
  await expect(
    runtime.execute(sql`
      insert into model_policy_runtime_test.read_only (id) values (2)
    `),
  ).rejects.toMatchObject({ cause: { code: "42501" } });
  await expect(
    admin.execute(sql`
      insert into model_policy_runtime_test.read_only (id) values (2)
    `),
  ).rejects.toMatchObject({ cause: { code: "55000" } });

  await runtime.execute(sql`
    insert into model_policy_runtime_test.append_only (id, value)
    values (1, 'created')
  `);
  await expect(
    runtime.execute(sql`
      update model_policy_runtime_test.append_only set value = 'changed'
      where id = 1
    `),
  ).rejects.toMatchObject({ cause: { code: "42501" } });
  await expect(
    admin.execute(sql`
      update model_policy_runtime_test.append_only set value = 'changed'
      where id = 1
    `),
  ).rejects.toMatchObject({ cause: { code: "55000" } });

  await runtime.execute(sql`
    insert into model_policy_runtime_test.mutable_no_delete
      (id, immutable_value, value)
    values (1, 'fixed', 'created')
  `);
  await expect(
    runtime.execute(sql`
      update model_policy_runtime_test.mutable_no_delete set value = 'changed'
      where id = 1 returning value
    `),
  ).resolves.toMatchObject([{ value: "changed" }]);
  await expect(
    runtime.execute(sql`
      update model_policy_runtime_test.mutable_no_delete
      set immutable_value = 'changed' where id = 1
    `),
  ).rejects.toMatchObject({ cause: { code: "55000" } });
  await expect(
    admin.execute(sql`
      update model_policy_runtime_test.mutable_no_delete
      set id = 2 where id = 1
    `),
  ).rejects.toMatchObject({ cause: { code: "55000" } });
  await expect(
    runtime.execute(sql`
      delete from model_policy_runtime_test.mutable_no_delete where id = 1
    `),
  ).rejects.toMatchObject({ cause: { code: "42501" } });

  await runtime.execute(sql`
    insert into model_policy_runtime_test.full_crud (id, value)
    values (1, 'created')
  `);
  await runtime.execute(sql`
    update model_policy_runtime_test.full_crud set value = 'changed' where id = 1
  `);
  await expect(
    runtime.execute(sql`
      delete from model_policy_runtime_test.full_crud where id = 1 returning id
    `),
  ).resolves.toMatchObject([{ id: 1 }]);
  await expect(
    runtime.execute(sql`truncate model_policy_runtime_test.full_crud`),
  ).rejects.toMatchObject({ cause: { code: "42501" } });
  await expect(
    admin.execute(sql`truncate model_policy_runtime_test.full_crud`),
  ).rejects.toMatchObject({ cause: { code: "55000" } });
});

it("reconciles policy and immutable-field changes as full database state", async () => {
  const admin = getIntegrationDatabase();
  const runtime = getDatabase();
  await admin.execute(sql`create schema model_policy_change_test`);
  await admin.execute(sql`
    create table model_policy_change_test.records (
      id integer primary key,
      fixed text,
      newly_fixed text,
      value text
    )
  `);
  const changeSchema = pgSchema("model_policy_change_test");
  const changeColumns = () => ({
    id: integer("id").notNull(),
    fixed: text("fixed"),
    newlyFixed: text("newly_fixed"),
    value: text("value"),
  });
  const appendOnly = defineModelTable({
    schema: changeSchema,
    name: "records",
    columns: changeColumns(),
    primaryKey: ["id"],
    writePolicy: "append-only",
  });
  await applyPolicies({ appendOnly });
  await runtime.execute(sql`
    insert into model_policy_change_test.records
      (id, fixed, newly_fixed, value)
    values (1, 'fixed', 'initial', 'created')
  `);
  await expect(
    runtime.execute(sql`
      update model_policy_change_test.records set value = 'blocked' where id = 1
    `),
  ).rejects.toMatchObject({ cause: { code: "42501" } });

  const mutable = defineModelTable({
    schema: changeSchema,
    name: "records",
    columns: changeColumns(),
    primaryKey: ["id"],
    writePolicy: "mutable-no-delete",
    immutableFields: ["fixed"],
  });
  await applyPolicies({ mutable });
  await expect(
    runtime.execute(sql`
      update model_policy_change_test.records
      set value = 'allowed' where id = 1 returning value
    `),
  ).resolves.toMatchObject([{ value: "allowed" }]);
  await expect(
    runtime.execute(sql`
      update model_policy_change_test.records set fixed = 'blocked' where id = 1
    `),
  ).rejects.toMatchObject({ cause: { code: "55000" } });

  const expandedImmutableFields = defineModelTable({
    schema: changeSchema,
    name: "records",
    columns: changeColumns(),
    primaryKey: ["id"],
    writePolicy: "mutable-no-delete",
    immutableFields: ["fixed", "newlyFixed"],
  });
  await applyPolicies({ expandedImmutableFields });
  await expect(
    runtime.execute(sql`
      update model_policy_change_test.records
      set newly_fixed = 'blocked' where id = 1
    `),
  ).rejects.toMatchObject({ cause: { code: "55000" } });

  await applyPolicies({ appendOnly });
  await expect(
    runtime.execute(sql`
      update model_policy_change_test.records set value = 'blocked' where id = 1
    `),
  ).rejects.toMatchObject({ cause: { code: "42501" } });
});
