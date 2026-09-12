import { sql } from "drizzle-orm";

import { expect, it } from "@testkit/integration";
import { getIntegrationDatabase } from "@testkit/postgres";
import {
  startPostgresTestDatabase,
} from "./postgres";

it("provisions migrated databases that are isolated from each other", async () => {
  const first = getIntegrationDatabase();
  const second = await startPostgresTestDatabase();

  try {
    const migratedTables = await first.execute<{ tableName: string | null }>(sql`
      select to_regclass('financial.accounts')::text as "tableName"
    `);
    expect(migratedTables[0]?.tableName).toBe("financial.accounts");

    await first.execute(sql`
      create table postgres_fixture_safeguard (
        value text not null
      )
    `);
    await first.execute(sql`
      insert into postgres_fixture_safeguard (value)
      values ('integration test')
    `);

    const rows = await first.execute<{ value: string }>(sql`
      select value from postgres_fixture_safeguard
    `);
    expect(rows[0]?.value).toBe("integration test");

    const isolatedRows = await second.db.execute<{ tableName: string | null }>(sql`
      select to_regclass('postgres_fixture_safeguard')::text as "tableName"
    `);
    expect(isolatedRows[0]?.tableName).toBeNull();
  } finally {
    await second.stop();
  }
});
