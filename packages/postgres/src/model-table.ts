import type {
  BuildColumns,
  BuildExtraConfigColumns,
} from "drizzle-orm/column-builder";
import { getTableColumns } from "drizzle-orm";
import {
  getTableConfig,
  primaryKey,
  type PgColumnBuilderBase,
  type PgSchema,
  type PgTable,
  type PgTableExtraConfigValue,
  type PgTableWithColumns,
} from "drizzle-orm/pg-core";

type TableRow<TTable extends PgTable> = TTable["$inferSelect"];
export type ModelTableKey<TTable extends PgTable> = keyof TableRow<TTable> &
  string;

export type ModelTableWritePolicy =
  | "append-only"
  | "controlled-lifecycle"
  | "full-crud"
  | "mutable-no-delete"
  | "read-only";

export type ModelTableDefinition<
  TPrimaryKey extends readonly string[],
  TWritePolicy extends ModelTableWritePolicy,
> = Readonly<{
  primaryKey: TPrimaryKey;
  writePolicy: TWritePolicy;
}>;

const modelTableDefinition = Symbol("monii.modelTableDefinition");

export type ModelTable<
  TTable extends PgTable = PgTable,
  TPrimaryKey extends readonly string[] = readonly string[],
  TWritePolicy extends ModelTableWritePolicy = ModelTableWritePolicy,
> = TTable & {
  readonly [modelTableDefinition]: ModelTableDefinition<
    TPrimaryKey,
    TWritePolicy
  >;
};

type PrimaryKeyColumn<TColumns extends Record<string, PgColumnBuilderBase>> = {
  [TKey in keyof TColumns]: TColumns[TKey]["_"]["notNull"] extends true
    ? TColumns[TKey] extends { _: { isPrimaryKey: true } }
      ? never
      : TKey
    : never;
}[keyof TColumns] &
  string;

type DefinedTable<
  TSchema extends string,
  TName extends string,
  TColumns extends Record<string, PgColumnBuilderBase>,
> = PgTableWithColumns<{
  name: TName;
  schema: TSchema;
  columns: BuildColumns<TName, TColumns, "pg">;
  dialect: "pg";
}>;

export type DefineModelTableConfig<
  TSchema extends string,
  TName extends string,
  TColumns extends Record<string, PgColumnBuilderBase>,
  TPrimaryKey extends readonly [
    PrimaryKeyColumn<TColumns>,
    ...PrimaryKeyColumn<TColumns>[],
  ],
  TWritePolicy extends ModelTableWritePolicy,
> = Readonly<{
  schema: PgSchema<TSchema>;
  name: TName;
  columns: TColumns;
  primaryKey: TPrimaryKey;
  writePolicy: TWritePolicy;
  constraints?: (
    table: BuildExtraConfigColumns<TName, TColumns, "pg">,
  ) => PgTableExtraConfigValue[];
}>;

function actualPrimaryKeyFields(table: PgTable): string[] {
  const tableConfig = getTableConfig(table);
  const columnsByField = getTableColumns(table) as Record<
    string,
    { name: string; primary: boolean }
  >;
  const fieldsByColumn = new Map(
    Object.entries(columnsByField).map(([field, column]) => [
      column.name,
      field,
    ]),
  );
  const inlinePrimaryKey = Object.entries(columnsByField)
    .filter(([, column]) => column.primary)
    .map(([field]) => field);
  const compositePrimaryKeys = tableConfig.primaryKeys.map((tablePrimaryKey) =>
    tablePrimaryKey.columns.map(
      (column) => fieldsByColumn.get(column.name) ?? column.name,
    ),
  );
  const primaryKeys = [
    ...(inlinePrimaryKey.length > 0 ? [inlinePrimaryKey] : []),
    ...compositePrimaryKeys,
  ];

  if (primaryKeys.length !== 1) {
    throw new Error(
      `ModelTable ${tableConfig.schema ?? "public"}.${tableConfig.name} must have exactly one primary key`,
    );
  }
  return primaryKeys[0]!;
}

function validatePrimaryKey(
  table: PgTable,
  declaredPrimaryKey: readonly string[],
): void {
  const actualPrimaryKey = actualPrimaryKeyFields(table);
  if (
    actualPrimaryKey.length !== declaredPrimaryKey.length ||
    actualPrimaryKey.some((field, index) => field !== declaredPrimaryKey[index])
  ) {
    const tableConfig = getTableConfig(table);
    throw new Error(
      `ModelTable ${tableConfig.schema ?? "public"}.${tableConfig.name} declares primary key (${declaredPrimaryKey.join(", ")}) but Drizzle defines (${actualPrimaryKey.join(", ")})`,
    );
  }
}

/**
 * Defines an actual Drizzle table together with its model identity and policy.
 * The primary-key tuple creates the Drizzle constraint and types model lookups.
 */
export function defineModelTable<
  const TSchema extends string,
  const TName extends string,
  TColumns extends Record<string, PgColumnBuilderBase>,
  const TPrimaryKey extends readonly [
    PrimaryKeyColumn<TColumns>,
    ...PrimaryKeyColumn<TColumns>[],
  ],
  const TWritePolicy extends ModelTableWritePolicy,
>(
  definition: DefineModelTableConfig<
    TSchema,
    TName,
    TColumns,
    TPrimaryKey,
    TWritePolicy
  >,
): ModelTable<
  DefinedTable<TSchema, TName, TColumns>,
  TPrimaryKey,
  TWritePolicy
> {
  const { columns, constraints, name, schema } = definition;
  const table = schema.table(name, columns, (configuredColumns) => [
    primaryKey({
      name: definition.primaryKey.length === 1 ? `${name}_pkey` : undefined,
      columns: definition.primaryKey.map(
        (field) => configuredColumns[field],
      ) as [
        (typeof configuredColumns)[TPrimaryKey[0]],
        ...(typeof configuredColumns)[TPrimaryKey[number]][],
      ],
    }),
    ...(constraints?.(configuredColumns) ?? []),
  ]);
  validatePrimaryKey(table, definition.primaryKey);
  Object.defineProperty(table, modelTableDefinition, {
    configurable: false,
    enumerable: false,
    value: Object.freeze({
      primaryKey: Object.freeze([...definition.primaryKey]),
      writePolicy: definition.writePolicy,
    }),
    writable: false,
  });
  return table as ModelTable<
    DefinedTable<TSchema, TName, TColumns>,
    TPrimaryKey,
    TWritePolicy
  >;
}

export function isModelTable(value: unknown): value is ModelTable {
  return (
    typeof value === "object" && value !== null && modelTableDefinition in value
  );
}

export function getModelTableDefinition<
  TTable extends PgTable,
  TPrimaryKey extends readonly string[],
  TWritePolicy extends ModelTableWritePolicy,
>(
  table: ModelTable<TTable, TPrimaryKey, TWritePolicy>,
): ModelTableDefinition<TPrimaryKey, TWritePolicy> {
  return table[modelTableDefinition];
}
