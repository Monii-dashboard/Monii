import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import * as schema from "../src/schema/index";
import {
  createModelTablePolicySnapshot,
  modelTablePolicyHash,
  renderModelTablePolicyMigration,
} from "../src/model-table-policy";

const repositoryRoot = path.resolve(import.meta.dirname, "../../..");
const migrationsDirectory = path.join(repositoryRoot, "drizzle");
const policyHashPattern =
  /^-- monii-model-table-policy-sha256:([a-f0-9]{64})$/m;

function currentPolicy() {
  const snapshot = createModelTablePolicySnapshot(schema);
  return {
    hash: modelTablePolicyHash(snapshot),
    sql: renderModelTablePolicyMigration(snapshot),
  };
}

function latestGeneratedPolicy():
  | Readonly<{ hash: string; sql: string }>
  | undefined {
  return readdirSync(migrationsDirectory)
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort()
    .reverse()
    .map((name) => {
      const sql = readFileSync(path.join(migrationsDirectory, name), "utf8");
      const hash = sql.match(policyHashPattern)?.[1];
      return hash ? { hash, sql } : undefined;
    })
    .find((policy) => policy !== undefined);
}

function runDrizzleGenerate(arguments_: readonly string[]): void {
  const result = spawnSync(
    "pnpm",
    ["exec", "drizzle-kit", "generate", ...arguments_],
    {
      cwd: repositoryRoot,
      env: process.env,
      stdio: "inherit",
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function latestMigrationPath(): string {
  const journal = JSON.parse(
    readFileSync(path.join(migrationsDirectory, "meta/_journal.json"), "utf8"),
  ) as { entries: { idx: number; tag: string }[] };
  const entry = journal.entries.at(-1);
  if (!entry) throw new Error("Drizzle migration journal has no entries");
  return path.join(migrationsDirectory, `${entry.tag}.sql`);
}

const arguments_ = process.argv.slice(2);
const check = arguments_.includes("--check");
const drizzleArguments = arguments_.filter(
  (argument) => argument !== "--check",
);
const policy = currentPolicy();

if (check) {
  const generatedPolicy = latestGeneratedPolicy();
  if (
    generatedPolicy?.hash !== policy.hash ||
    generatedPolicy.sql !== policy.sql
  ) {
    process.stderr.write(
      "ModelTable policies changed without a generated custom migration. Run pnpm db:generate.\n",
    );
    process.exit(1);
  }
  process.stdout.write("ModelTable policy migration is current.\n");
  process.exit(0);
}

runDrizzleGenerate(drizzleArguments);
const generatedPolicy = latestGeneratedPolicy();
if (
  generatedPolicy?.hash === policy.hash &&
  generatedPolicy.sql === policy.sql
) {
  process.stdout.write("No ModelTable policy changes, nothing to migrate.\n");
  process.exit(0);
}

runDrizzleGenerate(["--custom", "--name=model_table_policies"]);
const migrationPath = latestMigrationPath();
writeFileSync(migrationPath, policy.sql);
process.stdout.write(
  `Generated ModelTable policy migration ${migrationPath}\n`,
);
