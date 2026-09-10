import { sql } from "drizzle-orm";
import { describe } from "vitest";

import { expect, test } from "./postgres";

describe.sequential("PostgreSQL integration fixture", () => {
  let precedingContainerId: string | undefined;

  test("applies committed migrations and accepts writes", async ({ db, postgres }) => {
    precedingContainerId = postgres.getId();
    const migratedTables = await db.execute<{ tableName: string | null }>(sql`
      select to_regclass('financial.accounts')::text as "tableName"
    `);
    expect(migratedTables[0]?.tableName).toBe("financial.accounts");

    await db.execute(sql`
      create table postgres_fixture_safeguard (
        value text not null
      )
    `);
    await db.execute(sql`
      insert into postgres_fixture_safeguard (value)
      values ('integration test')
    `);

    const rows = await db.execute<{ value: string }>(sql`
      select value from postgres_fixture_safeguard
    `);

    expect(rows[0]?.value).toBe("integration test");
  });

  test("uses a new container without schema changes from the preceding test", async ({
    db,
    postgres,
  }) => {
    expect(precedingContainerId).toBeDefined();
    expect(postgres.getId()).not.toBe(precedingContainerId);

    const rows = await db.execute<{ tableName: string | null }>(sql`
      select to_regclass('postgres_fixture_safeguard')::text as "tableName"
    `);

    expect(rows[0]?.tableName).toBeNull();
  });
});
