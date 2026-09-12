import { expect, test } from "vitest";
import { integer, pgSchema, text } from "drizzle-orm/pg-core";

import { defineModelTable } from "./model-table";
import {
  createModelTablePolicySnapshot,
  modelTablePolicyComment,
  modelTablePolicyHash,
  renderModelTablePolicyMigration,
} from "./model-table-policy";

const schema = pgSchema("policy_test");

function policyTables() {
  return {
    appendOnly: defineModelTable({
      schema,
      name: "append_only",
      columns: { id: integer("id").notNull() },
      primaryKey: ["id"],
      writePolicy: "append-only",
    }),
    fullCrud: defineModelTable({
      schema,
      name: "full_crud",
      columns: { id: integer("id").notNull() },
      primaryKey: ["id"],
      writePolicy: "full-crud",
      immutableFields: [],
    }),
    mutable: defineModelTable({
      schema,
      name: "mutable",
      columns: {
        id: integer("id").notNull(),
        immutableValue: text("immutable_value"),
      },
      primaryKey: ["id"],
      writePolicy: "mutable-no-delete",
      immutableFields: ["immutableValue"],
    }),
    readOnly: defineModelTable({
      schema,
      name: "read_only",
      columns: { id: integer("id").notNull() },
      primaryKey: ["id"],
      writePolicy: "read-only",
    }),
  };
}

test("describes stable database policy metadata from ModelTables", () => {
  const snapshot = createModelTablePolicySnapshot(policyTables());

  expect(snapshot.tables.map((table) => table.name)).toEqual([
    "append_only",
    "full_crud",
    "mutable",
    "read_only",
  ]);
  expect(snapshot.tables.find((table) => table.name === "mutable")).toEqual({
    name: "mutable",
    schema: "policy_test",
    primaryKey: ["id"],
    writePolicy: "mutable-no-delete",
    immutableColumns: ["id", "immutable_value"],
  });
  expect(modelTablePolicyHash(snapshot)).toMatch(/^[a-f0-9]{64}$/);
  expect(modelTablePolicyComment(snapshot.tables[0]!)).toMatch(
    /^monii:model-table:v1:append-only:[a-f0-9]{16}$/,
  );
});

test("renders least-privilege grants and mutation guards for every policy", () => {
  const sql = renderModelTablePolicyMigration(
    createModelTablePolicySnapshot(policyTables()),
  );

  expect(sql).toContain(
    'GRANT SELECT ON TABLE "policy_test"."read_only" TO "monii_runtime";',
  );
  expect(sql).toContain(
    'BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON "policy_test"."read_only"',
  );
  expect(sql).toContain(
    'GRANT SELECT, INSERT ON TABLE "policy_test"."append_only" TO "monii_runtime";',
  );
  expect(sql).toContain(
    'BEFORE UPDATE OR DELETE OR TRUNCATE ON "policy_test"."append_only"',
  );
  expect(sql).toContain(
    'GRANT SELECT, INSERT, UPDATE ON TABLE "policy_test"."mutable" TO "monii_runtime";',
  );
  expect(sql).toContain('BEFORE DELETE OR TRUNCATE ON "policy_test"."mutable"');
  expect(sql).toContain(
    'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "policy_test"."full_crud" TO "monii_runtime";',
  );
  expect(sql).toContain('BEFORE TRUNCATE ON "policy_test"."full_crud"');
  expect(sql).toContain(
    `public.monii_reject_immutable_field_update('["id","immutable_value"]')`,
  );
  expect(sql).toContain(
    'CREATE TRIGGER monii_model_table_immutable_guard\nBEFORE UPDATE ON "policy_test"."mutable"',
  );
  expect(sql).toContain("NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE");
  expect(sql).not.toContain("GRANT TRUNCATE");
});

test("changes policy fingerprints when database rules change", () => {
  const baseline = createModelTablePolicySnapshot(policyTables());
  const changed = createModelTablePolicySnapshot({
    ...policyTables(),
    mutable: defineModelTable({
      schema,
      name: "mutable",
      columns: {
        id: integer("id").notNull(),
        immutableValue: text("immutable_value"),
      },
      primaryKey: ["id"],
      writePolicy: "mutable-no-delete",
      immutableFields: [],
    }),
  });

  expect(modelTablePolicyHash(changed)).not.toBe(
    modelTablePolicyHash(baseline),
  );
  expect(renderModelTablePolicyMigration(changed)).not.toBe(
    renderModelTablePolicyMigration(baseline),
  );
});
