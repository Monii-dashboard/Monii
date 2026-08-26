import { sql } from "drizzle-orm";

import { expect, test } from "./postgres";

test("provides a working PostgreSQL database", async ({ db }) => {
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

test("rolls back database changes between integration tests", async ({ db }) => {
  const rows = await db.execute<{ tableName: string | null }>(sql`
    select to_regclass('postgres_fixture_safeguard')::text as "tableName"
  `);

  expect(rows[0]?.tableName).toBeNull();
});
