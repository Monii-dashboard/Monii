import {
  and,
  eq,
  getTableColumns,
  isNull,
  type Column,
  type SQL,
} from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

import { getDatabase } from "./client";
import {
  getModelTableDefinition,
  type ModelTable,
  type ModelTableKey,
  type ModelTableWritePolicy,
} from "./model-table";

export {
  defineModelTable,
  getModelTableDefinition,
  isModelTable,
  type ModelTable,
  type ModelTableDefinition,
  type ModelTableKey,
  type ModelTableWritePolicy,
} from "./model-table";

type Row<TTable extends PgTable> = TTable["$inferSelect"];
type Insert<TTable extends PgTable> = TTable["$inferInsert"];
type RowKey<TTable extends PgTable> = ModelTableKey<TTable>;
type PrimaryKeyInput<
  TTable extends PgTable,
  TPrimaryKey extends readonly RowKey<TTable>[],
> = TPrimaryKey extends readonly [infer TKey extends RowKey<TTable>]
  ? Row<TTable>[TKey]
  : Pick<Row<TTable>, TPrimaryKey[number]>;
type Update<
  TTable extends PgTable,
  TPrimaryKey extends readonly RowKey<TTable>[],
  TImmutableFields extends readonly RowKey<TTable>[],
> = Partial<
  Omit<Insert<TTable>, TPrimaryKey[number] | TImmutableFields[number]>
>;

function cloneRow<T>(row: T): T {
  return structuredClone(row);
}

export type ModelQueryDefinition<TResult> = Readonly<{
  load: () => Promise<readonly TResult[]>;
}>;

type ModelQueryDefinitions = Readonly<
  Record<string, ModelQueryDefinition<unknown>>
>;

type ModelQueryResult<TDefinition> =
  TDefinition extends ModelQueryDefinition<infer TResult> ? TResult : never;

export type ModelQuery<TResult> = Readonly<{
  count: () => Promise<number>;
  load: () => Promise<TResult[]>;
  loadOne: () => Promise<TResult | null>;
}>;

export function defineModelQuery<TResult>(
  load: () => Promise<readonly TResult[]>,
): ModelQueryDefinition<TResult> {
  return { load };
}

export type ModelRecord<TTable extends PgTable> = Readonly<Row<TTable>> & {
  toJSON(): Row<TTable>;
};

type ReadModelClass<
  TTable extends PgTable,
  TPrimaryKey extends readonly RowKey<TTable>[],
  TQueries extends ModelQueryDefinitions = Record<never, never>,
> = {
  new (row: Row<TTable>): ModelRecord<TTable>;
  readonly table: TTable;
  find(
    primaryKey: PrimaryKeyInput<TTable, TPrimaryKey>,
  ): Promise<ModelRecord<TTable> | null>;
  findMany(filters?: Partial<Row<TTable>>): Promise<ModelRecord<TTable>[]>;
  query<TKey extends keyof TQueries & string>(
    name: TKey,
  ): ModelQuery<ModelQueryResult<TQueries[TKey]>>;
};

type CreateModelClass<TTable extends PgTable> = {
  create(values: Insert<TTable>): Promise<ModelRecord<TTable>>;
};

type UpdateModelClass<
  TTable extends PgTable,
  TPrimaryKey extends readonly RowKey<TTable>[],
  TImmutableFields extends readonly RowKey<TTable>[],
> = {
  update(
    primaryKey: PrimaryKeyInput<TTable, TPrimaryKey>,
    values: Update<TTable, TPrimaryKey, TImmutableFields>,
  ): Promise<ModelRecord<TTable> | null>;
};

type DeleteModelClass<
  TTable extends PgTable,
  TPrimaryKey extends readonly RowKey<TTable>[],
> = {
  delete(primaryKey: PrimaryKeyInput<TTable, TPrimaryKey>): Promise<boolean>;
};

type WithCreate<
  TTable extends PgTable,
  TPolicy extends ModelTableWritePolicy,
> = TPolicy extends "read-only" ? object : CreateModelClass<TTable>;
type WithUpdate<
  TTable extends PgTable,
  TPrimaryKey extends readonly RowKey<TTable>[],
  TImmutableFields extends readonly RowKey<TTable>[],
  TPolicy extends ModelTableWritePolicy,
> = TPolicy extends "full-crud" | "mutable-no-delete"
  ? UpdateModelClass<TTable, TPrimaryKey, TImmutableFields>
  : object;
type WithDelete<
  TTable extends PgTable,
  TPrimaryKey extends readonly RowKey<TTable>[],
  TPolicy extends ModelTableWritePolicy,
> = TPolicy extends "full-crud"
  ? DeleteModelClass<TTable, TPrimaryKey>
  : object;

export type ModelClass<
  TTable extends PgTable,
  TPrimaryKey extends readonly RowKey<TTable>[],
  TWritePolicy extends ModelTableWritePolicy,
  TImmutableFields extends readonly RowKey<TTable>[],
  TQueries extends ModelQueryDefinitions = Record<never, never>,
> = ReadModelClass<TTable, TPrimaryKey, TQueries> &
  WithCreate<TTable, TWritePolicy> &
  WithUpdate<TTable, TPrimaryKey, TImmutableFields, TWritePolicy> &
  WithDelete<TTable, TPrimaryKey, TWritePolicy>;

function conditionsFor(
  table: PgTable,
  values: Readonly<Record<string, unknown>>,
): SQL[] {
  const columns = getTableColumns(table) as Record<string, Column>;
  return Object.entries(values).flatMap(([key, value]) => {
    if (value === undefined) return [];
    const column = columns[key];
    if (!column) throw new Error(`Unknown model field ${key}`);
    return [value === null ? isNull(column) : eq(column, value)];
  });
}

function primaryKeyValues<
  TTable extends PgTable,
  TPrimaryKey extends readonly RowKey<TTable>[],
>(
  primaryKey: PrimaryKeyInput<TTable, TPrimaryKey>,
  keys: TPrimaryKey,
): Readonly<Record<string, unknown>> {
  if (keys.length === 0) throw new Error("A model primary key is required");
  if (keys.length === 1) {
    if (primaryKey === undefined || primaryKey === null) {
      throw new Error(`Model primary key ${keys[0]} is required`);
    }
    return { [keys[0] as string]: primaryKey };
  }
  if (typeof primaryKey !== "object" || primaryKey === null) {
    throw new Error("Composite model primary keys must be an object");
  }
  const values = primaryKey as Readonly<Record<string, unknown>>;
  return Object.fromEntries(
    keys.map((key) => {
      const value = values[key];
      if (value === undefined || value === null) {
        throw new Error(`Model primary key ${key} is required`);
      }
      return [key, value];
    }),
  );
}

/**
 * Creates a lightweight Active Record base class for one Drizzle table.
 * Capability-owned subclasses inherit policy-derived writes and named queries.
 */
export function modelFor<
  TTable extends PgTable,
  const TPrimaryKey extends readonly RowKey<TTable>[],
  const TWritePolicy extends ModelTableWritePolicy,
  const TImmutableFields extends readonly RowKey<TTable>[],
  const TQueries extends ModelQueryDefinitions = Record<never, never>,
>(
  table: ModelTable<TTable, TPrimaryKey, TWritePolicy, TImmutableFields>,
  queries = {} as TQueries,
): ModelClass<
  TTable,
  TPrimaryKey,
  TWritePolicy,
  TImmutableFields,
  TQueries
> {
  const { immutableFields, primaryKey, writePolicy } =
    getModelTableDefinition(table);
  class TableModel {
    static readonly table = table;

    readonly #row: Row<TTable>;

    constructor(row: Row<TTable>) {
      this.#row = cloneRow(row);
      for (const key of Object.keys(row) as RowKey<TTable>[]) {
        Object.defineProperty(this, key, {
          configurable: false,
          enumerable: true,
          get: () => cloneRow(this.#row[key]),
        });
      }
      Object.freeze(this);
    }

    static async find(key: PrimaryKeyInput<TTable, TPrimaryKey>) {
      const rows = (await getDatabase()
        .select()
        .from(table as never)
        .where(and(...conditionsFor(table, primaryKeyValues(key, primaryKey))))
        .limit(1)) as unknown as Row<TTable>[];
      const [row] = rows;
      return row ? new this(row as Row<TTable>) : null;
    }

    static async findMany(filters: Partial<Row<TTable>> = {}) {
      const rows = (await getDatabase()
        .select()
        .from(table as never)
        .where(
          and(...conditionsFor(table, filters)),
        )) as unknown as Row<TTable>[];
      return rows.map((row) => new this(row));
    }

    static query(name: keyof TQueries & string): ModelQuery<unknown> {
      const definition = queries[name];
      if (!definition) throw new Error(`Unknown model query ${name}`);
      const load = async () => [...(await definition.load())];
      return {
        count: async () => (await load()).length,
        load,
        loadOne: async () => (await load())[0] ?? null,
      };
    }

    toJSON(): Row<TTable> {
      return cloneRow(this.#row);
    }
  }

  if (writePolicy !== "read-only") {
    Object.defineProperty(TableModel, "create", {
      value: async function (this: typeof TableModel, values: Insert<TTable>) {
        const [row] = await getDatabase()
          .insert(table)
          .values(values)
          .returning();
        if (!row) throw new Error("Model insert did not return a row");
        return new this(row as Row<TTable>);
      },
    });
  }
  if (writePolicy === "full-crud" || writePolicy === "mutable-no-delete") {
    Object.defineProperty(TableModel, "update", {
      value: async function (
        this: typeof TableModel,
        key: PrimaryKeyInput<TTable, TPrimaryKey>,
        values: Update<TTable, TPrimaryKey, TImmutableFields>,
      ) {
        const immutableField = immutableFields.find((field) =>
          Object.hasOwn(values, field),
        );
        if (immutableField) {
          throw new Error(`Model field ${immutableField} is immutable`);
        }
        const [row] = await getDatabase()
          .update(table)
          .set(values as Partial<Insert<TTable>>)
          .where(
            and(...conditionsFor(table, primaryKeyValues(key, primaryKey))),
          )
          .returning();
        return row ? new this(row as Row<TTable>) : null;
      },
    });
  }
  if (writePolicy === "full-crud") {
    Object.defineProperty(TableModel, "delete", {
      value: async function (key: PrimaryKeyInput<TTable, TPrimaryKey>) {
        const deleted = await getDatabase()
          .delete(table)
          .where(
            and(...conditionsFor(table, primaryKeyValues(key, primaryKey))),
          )
          .returning();
        return deleted.length > 0;
      },
    });
  }

  return TableModel as unknown as ModelClass<
    TTable,
    TPrimaryKey,
    TWritePolicy,
    TImmutableFields,
    TQueries
  >;
}
