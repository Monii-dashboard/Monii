import { expect, expectTypeOf, test } from "vitest";
import { getTableConfig, integer, pgSchema } from "drizzle-orm/pg-core";

import { defineModelTable, getModelTableDefinition } from "./model-table";
import { modelFor } from "./model";

test("constructs single-column and composite Drizzle primary keys", () => {
  const schema = pgSchema("model_table_test");
  const inline = defineModelTable({
    schema,
    name: "inline_model_table",
    columns: { id: integer("id").notNull() },
    primaryKey: ["id"],
    writePolicy: "append-only",
  });
  const composite = defineModelTable({
    schema,
    name: "composite_model_table",
    columns: {
      leftId: integer("left_id").notNull(),
      rightId: integer("right_id").notNull(),
    },
    primaryKey: ["leftId", "rightId"],
    writePolicy: "append-only",
  });

  expect(getModelTableDefinition(inline).primaryKey).toEqual(["id"]);
  expect(getModelTableDefinition(composite).primaryKey).toEqual([
    "leftId",
    "rightId",
  ]);
  expect(
    getTableConfig(inline).primaryKeys[0]?.columns.map((column) => column.name),
  ).toEqual(["id"]);
  expect(
    getTableConfig(composite).primaryKeys[0]?.columns.map(
      (column) => column.name,
    ),
  ).toEqual(["left_id", "right_id"]);

  expect(() =>
    defineModelTable({
      schema,
      name: "duplicate_primary_key",
      columns: { id: integer("id").primaryKey() },
      // @ts-expect-error ModelTable creates the Drizzle primary-key constraint.
      primaryKey: ["id"],
      writePolicy: "append-only",
    }),
  ).toThrow("must have exactly one primary key");

  if (false) {
    defineModelTable({
      schema,
      name: "nullable_primary_key",
      columns: { id: integer("id") },
      // @ts-expect-error ModelTable identity columns must be explicitly non-null.
      primaryKey: ["id"],
      writePolicy: "append-only",
    });
  }
});

test("derives model methods from every supported write policy", () => {
  const table = <
    const TName extends string,
    const TPolicy extends
      | "append-only"
      | "controlled-lifecycle"
      | "full-crud"
      | "mutable-no-delete"
      | "read-only",
  >(
    name: TName,
    writePolicy: TPolicy,
  ) =>
    defineModelTable({
      schema: pgSchema("model_table_policy_test"),
      name,
      columns: { id: integer("id").notNull() },
      primaryKey: ["id"],
      writePolicy,
    });

  const ReadOnly = modelFor(table("read_only_model", "read-only"));
  const AppendOnly = modelFor(table("append_only_model", "append-only"));
  const Lifecycle = modelFor(table("lifecycle_model", "controlled-lifecycle"));
  const Mutable = modelFor(table("mutable_model", "mutable-no-delete"));
  const FullCrud = modelFor(table("full_crud_model", "full-crud"));

  expectTypeOf(ReadOnly).not.toHaveProperty("create");
  expectTypeOf(AppendOnly).toHaveProperty("create");
  expectTypeOf(AppendOnly).not.toHaveProperty("update");
  expectTypeOf(Lifecycle).toHaveProperty("create");
  expectTypeOf(Lifecycle).not.toHaveProperty("update");
  expectTypeOf(Mutable).toHaveProperty("update");
  expectTypeOf(Mutable).not.toHaveProperty("delete");
  expectTypeOf(FullCrud).toHaveProperty("delete");

  expect(Object.hasOwn(ReadOnly, "create")).toBe(false);
  expect(Object.hasOwn(AppendOnly, "create")).toBe(true);
  expect(Object.hasOwn(AppendOnly, "update")).toBe(false);
  expect(Object.hasOwn(Lifecycle, "update")).toBe(false);
  expect(Object.hasOwn(Mutable, "update")).toBe(true);
  expect(Object.hasOwn(Mutable, "delete")).toBe(false);
  expect(Object.hasOwn(FullCrud, "delete")).toBe(true);
});
