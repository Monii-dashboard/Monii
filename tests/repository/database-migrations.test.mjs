import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

import {
  createModelTablePolicySnapshot,
  modelTablePolicyHash,
  renderModelTablePolicyMigration,
} from "../../packages/postgres/src/model-table-policy.ts";
import * as postgresSchema from "../../packages/postgres/src/schema/index.ts";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const migrationsDirectory = path.join(repositoryRoot, "drizzle");

test("keeps ordinary Drizzle schema changes synchronized with migrations", () => {
  const result = spawnSync("pnpm", ["db:check:schema"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });

  expect(result.status, result.stderr || result.stdout).toBe(0);
});

test("keeps generated ModelTable policies synchronized with declarations", () => {
  const generatedPolicies = readdirSync(migrationsDirectory)
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort()
    .reverse()
    .map((name) => {
      const migration = readFileSync(
        path.join(migrationsDirectory, name),
        "utf8",
      );
      return {
        hash: migration.match(
          /^-- monii-model-table-policy-sha256:([a-f0-9]{64})$/m,
        )?.[1],
        migration,
      };
    })
    .filter(({ hash }) => hash !== undefined);
  const snapshot = createModelTablePolicySnapshot(postgresSchema);

  expect(generatedPolicies[0]?.hash).toBe(modelTablePolicyHash(snapshot));
  expect(generatedPolicies[0]?.migration).toBe(
    renderModelTablePolicyMigration(snapshot),
  );
});

test("maps every Drizzle journal entry to exactly one migration file", () => {
  const journal = JSON.parse(
    readFileSync(path.join(migrationsDirectory, "meta/_journal.json"), "utf8"),
  );
  const migrationFiles = readdirSync(migrationsDirectory).filter((name) =>
    /^\d+_.+\.sql$/.test(name),
  );

  expect(migrationFiles.sort()).toEqual(
    journal.entries.map(({ tag }) => `${tag}.sql`).sort(),
  );
});
