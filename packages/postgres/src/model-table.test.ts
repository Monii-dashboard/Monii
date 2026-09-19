import { expect, expectTypeOf, test } from "vitest";
import { getTableConfig, integer, pgSchema, text } from "drizzle-orm/pg-core";

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
  const policySchema = pgSchema("model_table_policy_test");
  const ReadOnly = modelFor(
    defineModelTable({
      schema: policySchema,
      name: "read_only_model",
      columns: { id: integer("id").notNull() },
      primaryKey: ["id"],
      writePolicy: "read-only",
    }),
  );
  const AppendOnly = modelFor(
    defineModelTable({
      schema: policySchema,
      name: "append_only_model",
      columns: { id: integer("id").notNull() },
      primaryKey: ["id"],
      writePolicy: "append-only",
    }),
  );
  const Mutable = modelFor(
    defineModelTable({
      schema: policySchema,
      name: "mutable_model",
      columns: {
        id: integer("id").notNull(),
        immutableValue: text("immutable_value"),
        mutableValue: text("mutable_value"),
      },
      primaryKey: ["id"],
      writePolicy: "mutable-no-delete",
      immutableFields: ["immutableValue"],
    }),
  );
  const FullCrud = modelFor(
    defineModelTable({
      schema: policySchema,
      name: "full_crud_model",
      columns: { id: integer("id").notNull() },
      primaryKey: ["id"],
      writePolicy: "full-crud",
      immutableFields: [],
    }),
  );
  expectTypeOf(ReadOnly).not.toHaveProperty("create");
  expectTypeOf(ReadOnly).not.toHaveProperty("findForUpdate");
  expectTypeOf(AppendOnly).toHaveProperty("create");
  expectTypeOf(AppendOnly).not.toHaveProperty("update");
  expectTypeOf(AppendOnly).not.toHaveProperty("updateIf");
  expectTypeOf(Mutable).toHaveProperty("findForUpdate");
  expectTypeOf(Mutable).toHaveProperty("update");
  expectTypeOf(Mutable).toHaveProperty("updateIf");
  expectTypeOf(Mutable.update)
    .parameter(1)
    .not.toHaveProperty("immutableValue");
  expectTypeOf(Mutable.update).parameter(1).not.toHaveProperty("id");
  expectTypeOf(Mutable).not.toHaveProperty("delete");
  expectTypeOf(FullCrud).toHaveProperty("delete");

  expect(Object.hasOwn(ReadOnly, "create")).toBe(false);
  expect(Object.hasOwn(AppendOnly, "create")).toBe(true);
  expect(Object.hasOwn(AppendOnly, "update")).toBe(false);
  expect(Object.hasOwn(AppendOnly, "updateIf")).toBe(false);
  expect(Object.hasOwn(Mutable, "findForUpdate")).toBe(true);
  expect(Object.hasOwn(Mutable, "update")).toBe(true);
  expect(Object.hasOwn(Mutable, "updateIf")).toBe(true);
  expect(Object.hasOwn(Mutable, "delete")).toBe(false);
  expect(Object.hasOwn(FullCrud, "delete")).toBe(true);
});

test("makes primary keys immutable and validates immutable declarations", () => {
  const schema = pgSchema("model_table_immutable_test");
  const table = defineModelTable({
    schema,
    name: "immutable_model_table",
    columns: {
      id: integer("id").notNull(),
      createdAt: text("created_at").notNull(),
    },
    primaryKey: ["id"],
    writePolicy: "mutable-no-delete",
    immutableFields: ["createdAt"],
  });

  expect(getModelTableDefinition(table)).toMatchObject({
    immutableFields: ["id", "createdAt"],
  });
  expect(() =>
    defineModelTable({
      schema,
      name: "repeated_primary_key",
      columns: { id: integer("id").notNull() },
      primaryKey: ["id"],
      writePolicy: "mutable-no-delete",
      immutableFields: ["id"],
    }),
  ).toThrow("primary key id is already immutable");
  expect(() =>
    defineModelTable({
      schema,
      name: "duplicate_immutable_field",
      columns: {
        id: integer("id").notNull(),
        value: text("value"),
      },
      primaryKey: ["id"],
      writePolicy: "mutable-no-delete",
      immutableFields: ["value", "value"],
    }),
  ).toThrow("immutable fields must be distinct");
  expect(() =>
    defineModelTable({
      schema,
      name: "missing_immutable_declaration",
      columns: { id: integer("id").notNull() },
      primaryKey: ["id"],
      writePolicy: "mutable-no-delete",
    } as never),
  ).toThrow("requires immutableFields");
  if (false) {
    defineModelTable({
      schema,
      name: "unknown_immutable_field",
      columns: { id: integer("id").notNull() },
      primaryKey: ["id"],
      writePolicy: "mutable-no-delete",
      // @ts-expect-error Immutable fields must reference a real table field.
      immutableFields: ["missing"],
    });
    defineModelTable({
      schema,
      name: "immutable_append_only",
      columns: { id: integer("id").notNull() },
      primaryKey: ["id"],
      writePolicy: "append-only",
      // @ts-expect-error Immutable fields are only declared for update-capable tables.
      immutableFields: [],
    });
  }
});
