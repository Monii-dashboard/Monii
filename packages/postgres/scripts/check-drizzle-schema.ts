import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "../../..");
const migrationsDirectory = path.join(repositoryRoot, "drizzle");

function filesBelow(directory: string, relative = ""): string[] {
  return readdirSync(path.join(directory, relative), { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = path.join(relative, entry.name);
      return entry.isDirectory()
        ? filesBelow(directory, entryPath)
        : [entryPath];
    })
    .sort();
}

function changedFiles(before: string, after: string): string[] {
  const paths = new Set([...filesBelow(before), ...filesBelow(after)]);
  return [...paths].filter((relativePath) => {
    try {
      return !readFileSync(path.join(before, relativePath)).equals(
        readFileSync(path.join(after, relativePath)),
      );
    } catch {
      return true;
    }
  });
}

const temporaryRoot = mkdtempSync(
  path.join(os.tmpdir(), "monii-drizzle-schema-check-"),
);
const generatedMigrationsDirectory = path.join(temporaryRoot, "drizzle");

try {
  cpSync(migrationsDirectory, generatedMigrationsDirectory, {
    recursive: true,
  });
  const result = spawnSync(
    "pnpm",
    [
      "exec",
      "drizzle-kit",
      "generate",
      "--dialect=postgresql",
      "--schema=./packages/postgres/src/schema/index.ts",
      `--out=${path.relative(repositoryRoot, generatedMigrationsDirectory)}`,
    ],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
    },
  );
  if (result.error) throw result.error;
  if (
    result.status !== 0 ||
    /(^|\n)Error(?:\s|:)/.test(`${result.stdout}\n${result.stderr}`)
  ) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    process.exitCode = result.status || 1;
  } else {
    const changes = changedFiles(
      migrationsDirectory,
      generatedMigrationsDirectory,
    );
    if (changes.length > 0) {
      process.stderr.write(
        `Drizzle schema changed without a generated migration. Run pnpm db:generate.\nGenerated differences:\n${changes.map((file) => `- ${file}`).join("\n")}\n`,
      );
      process.exitCode = 1;
    } else {
      process.stdout.write("Drizzle schema migrations are current.\n");
    }
  }
} finally {
  rmSync(temporaryRoot, { force: true, recursive: true });
}
