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

type Row<TTable extends PgTable> = TTable["$inferSelect"];
type Insert<TTable extends PgTable> = TTable["$inferInsert"];
type RowKey<TTable extends PgTable> = keyof Row<TTable> & string;
type PrimaryKeyInput<
  TTable extends PgTable,
  TPrimaryKey extends readonly RowKey<TTable>[],
> = TPrimaryKey extends readonly [infer TKey extends RowKey<TTable>]
  ? Row<TTable>[TKey]
  : Pick<Row<TTable>, TPrimaryKey[number]>;
type Update<
  TTable extends PgTable,
  TPrimaryKey extends readonly RowKey<TTable>[],
> = Partial<Omit<Insert<TTable>, TPrimaryKey[number]>>;

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

export type ModelClass<
  TTable extends PgTable,
  TPrimaryKey extends readonly RowKey<TTable>[],
  TQueries extends ModelQueryDefinitions = Record<never, never>,
> = {
  new(row: Row<TTable>): ModelRecord<TTable>;
  readonly table: TTable;
  create(values: Insert<TTable>): Promise<ModelRecord<TTable>>;
  delete(primaryKey: PrimaryKeyInput<TTable, TPrimaryKey>): Promise<boolean>;
  find(
    primaryKey: PrimaryKeyInput<TTable, TPrimaryKey>,
  ): Promise<ModelRecord<TTable> | null>;
  findMany(filters?: Partial<Row<TTable>>): Promise<ModelRecord<TTable>[]>;
  query<TKey extends keyof TQueries & string>(
    name: TKey,
  ): ModelQuery<ModelQueryResult<TQueries[TKey]>>;
  update(
    primaryKey: PrimaryKeyInput<TTable, TPrimaryKey>,
    values: Update<TTable, TPrimaryKey>,
  ): Promise<ModelRecord<TTable> | null>;
};

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
  return Object.fromEntries(keys.map((key) => {
    const value = values[key];
    if (value === undefined || value === null) {
      throw new Error(`Model primary key ${key} is required`);
    }
    return [key, value];
  }));
}

/**
 * Creates a lightweight Active Record base class for one Drizzle table.
 * Capability-owned subclasses inherit typed CRUD and named query operations.
 */
export function modelFor<
  TTable extends PgTable,
  const TPrimaryKey extends readonly RowKey<TTable>[],
  const TQueries extends ModelQueryDefinitions = Record<never, never>,
>(
  table: TTable,
  primaryKey: TPrimaryKey,
  queries = {} as TQueries,
): ModelClass<TTable, TPrimaryKey, TQueries> {
  class TableModel {
    static readonly table = table;

    readonly #row: Row<TTable>;

    constructor(row: Row<TTable>) {
      this.#row = row;
      Object.assign(this, row);
    }

    static async create(values: Insert<TTable>) {
      const [row] = await getDatabase().insert(table).values(values).returning();
      if (!row) throw new Error("Model insert did not return a row");
      return new this(row as Row<TTable>);
    }

    static async delete(key: PrimaryKeyInput<TTable, TPrimaryKey>) {
      const deleted = await getDatabase()
        .delete(table)
        .where(and(...conditionsFor(table, primaryKeyValues(key, primaryKey))))
        .returning();
      return deleted.length > 0;
    }

    static async find(key: PrimaryKeyInput<TTable, TPrimaryKey>) {
      const rows = await getDatabase()
        .select()
        .from(table as never)
        .where(and(...conditionsFor(table, primaryKeyValues(key, primaryKey))))
        .limit(1) as unknown as Row<TTable>[];
      const [row] = rows;
      return row ? new this(row as Row<TTable>) : null;
    }

    static async findMany(filters: Partial<Row<TTable>> = {}) {
      const rows = await getDatabase()
        .select()
        .from(table as never)
        .where(and(...conditionsFor(table, filters))) as unknown as Row<TTable>[];
      return rows.map((row) => new this(row));
    }

    static query(name: keyof TQueries & string): ModelQuery<unknown> {
      const definition = queries[name];
      if (!definition) throw new Error(`Unknown model query ${name}`);
      const load = async () => [...await definition.load()];
      return {
        count: async () => (await load()).length,
        load,
        loadOne: async () => (await load())[0] ?? null,
      };
    }

    static async update(
      key: PrimaryKeyInput<TTable, TPrimaryKey>,
      values: Update<TTable, TPrimaryKey>,
    ) {
      const [row] = await getDatabase()
        .update(table)
        .set(values as Partial<Insert<TTable>>)
        .where(and(...conditionsFor(table, primaryKeyValues(key, primaryKey))))
        .returning();
      return row ? new this(row as Row<TTable>) : null;
    }

    toJSON(): Row<TTable> {
      return { ...this.#row };
    }
  }

  return TableModel as unknown as ModelClass<TTable, TPrimaryKey, TQueries>;
}
