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
  | "full-crud"
  | "mutable-no-delete"
  | "read-only";

type UpdateCapableWritePolicy = "full-crud" | "mutable-no-delete";

export type ModelTableDefinition<
  TPrimaryKey extends readonly string[],
  TWritePolicy extends ModelTableWritePolicy,
  TImmutableFields extends readonly string[],
> = Readonly<{
  immutableFields: readonly (TPrimaryKey[number] | TImmutableFields[number])[];
  primaryKey: TPrimaryKey;
  writePolicy: TWritePolicy;
}>;

const modelTableDefinition = Symbol("monii.modelTableDefinition");

export type ModelTable<
  TTable extends PgTable = PgTable,
  TPrimaryKey extends readonly string[] = readonly string[],
  TWritePolicy extends ModelTableWritePolicy = ModelTableWritePolicy,
  TImmutableFields extends readonly string[] = readonly string[],
> = TTable & {
  readonly [modelTableDefinition]: ModelTableDefinition<
    TPrimaryKey,
    TWritePolicy,
    TImmutableFields
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

type UpdateConfig<
  TColumns extends Record<string, PgColumnBuilderBase>,
  TWritePolicy extends ModelTableWritePolicy,
  TImmutableFields extends readonly (keyof TColumns & string)[],
> = TWritePolicy extends UpdateCapableWritePolicy
  ? Readonly<{
      immutableFields: TImmutableFields;
    }>
  : Readonly<{ immutableFields?: never }>;

export type DefineModelTableConfig<
  TSchema extends string,
  TName extends string,
  TColumns extends Record<string, PgColumnBuilderBase>,
  TPrimaryKey extends readonly [
    PrimaryKeyColumn<TColumns>,
    ...PrimaryKeyColumn<TColumns>[],
  ],
  TWritePolicy extends ModelTableWritePolicy,
  TImmutableFields extends readonly (keyof TColumns & string)[],
> = Readonly<{
  schema: PgSchema<TSchema>;
  name: TName;
  columns: TColumns;
  primaryKey: TPrimaryKey;
  writePolicy: TWritePolicy;
  constraints?: (
    table: BuildExtraConfigColumns<TName, TColumns, "pg">,
  ) => PgTableExtraConfigValue[];
}> &
  UpdateConfig<TColumns, TWritePolicy, TImmutableFields>;

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
  const TImmutableFields extends readonly (keyof TColumns & string)[],
>(
  definition: DefineModelTableConfig<
    TSchema,
    TName,
    TColumns,
    TPrimaryKey,
    TWritePolicy,
    TImmutableFields
  >,
): ModelTable<
  DefinedTable<TSchema, TName, TColumns>,
  TPrimaryKey,
  TWritePolicy,
  TImmutableFields
> {
  const updateCapable =
    definition.writePolicy === "full-crud" ||
    definition.writePolicy === "mutable-no-delete";
  if (updateCapable && !("immutableFields" in definition)) {
    throw new Error(
      "An update-capable ModelTable requires immutableFields, even when empty",
    );
  }
  if (
    !updateCapable &&
    "immutableFields" in definition
  ) {
    throw new Error(
      "Only an update-capable ModelTable may configure immutableFields",
    );
  }
  const declaredImmutableFields = definition.immutableFields ?? [];
  if (
    new Set(declaredImmutableFields).size !== declaredImmutableFields.length
  ) {
    throw new Error("ModelTable immutable fields must be distinct");
  }
  const unknownImmutableField = declaredImmutableFields.find(
    (field) => !(field in definition.columns),
  );
  if (unknownImmutableField) {
    throw new Error(
      `ModelTable immutable field ${unknownImmutableField} does not exist`,
    );
  }
  const repeatedPrimaryKey = declaredImmutableFields.find((field) =>
    (definition.primaryKey as readonly string[]).includes(field),
  );
  if (repeatedPrimaryKey) {
    throw new Error(
      `ModelTable primary key ${repeatedPrimaryKey} is already immutable`,
    );
  }
  const effectiveImmutableFields = [
    ...definition.primaryKey,
    ...declaredImmutableFields,
  ];
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
      immutableFields: Object.freeze(effectiveImmutableFields),
      primaryKey: Object.freeze([...definition.primaryKey]),
      writePolicy: definition.writePolicy,
    }),
    writable: false,
  });
  return table as ModelTable<
    DefinedTable<TSchema, TName, TColumns>,
    TPrimaryKey,
    TWritePolicy,
    TImmutableFields
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
  TImmutableFields extends readonly string[],
>(
  table: ModelTable<TTable, TPrimaryKey, TWritePolicy, TImmutableFields>,
): ModelTableDefinition<TPrimaryKey, TWritePolicy, TImmutableFields> {
  return table[modelTableDefinition];
}
