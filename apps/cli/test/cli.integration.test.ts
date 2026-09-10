import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const cliRoot = join(root, "apps/cli");

function invoke(args: string[], options: { cwd?: string; nodeEnv?: string; pnpm?: boolean } = {}) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: options.nodeEnv ?? "test",
    NO_COLOR: "1",
  };
  for (const key of Object.keys(env)) {
    if (/^(DATABASE_URL|POWENS_|ACCOUNT_IDENTITY_)/.test(key)) delete env[key];
  }
  const result = spawnSync(
    options.pnpm ? "pnpm" : process.execPath,
    options.pnpm ? args : ["--import", "tsx", "src/index.ts", ...args],
    { cwd: options.cwd ?? cliRoot, env, encoding: "utf8", timeout: 20_000 },
  );
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  expect(result.stdout).not.toContain('"event":"sync.');
  return { code: result.status, out: result.stdout, err: result.stderr };
}

describe.each(["development", "production"])("help without financial configuration (%s)", (nodeEnv) => {
  test.each([
    { args: [], invocation: "no arguments" },
    { args: ["--help"], invocation: "--help" },
    { args: ["-h"], invocation: "-h" },
    { args: ["help"], invocation: "help" },
  ])("prints root help for $invocation", ({ args }) => {
    const result = invoke(args, { nodeEnv });
    expect(result.code).toBe(0);
    expect(result.out).toContain("pnpm cli [COMMAND]");
    expect(result.out).toMatch(/sync\s+Synchronize/);
    expect(result.err).toBe("");
  }, 30_000);

  test.each([
    { args: ["sync", "--help"], invocation: "sync --help" },
    { args: ["sync", "-h"], invocation: "sync -h" },
    { args: ["help", "sync"], invocation: "help sync" },
  ])("prints sync help for $invocation", ({ args }) => {
    const result = invoke(args, { nodeEnv });
    expect(result.code).toBe(0);
    expect(result.out).toContain("pnpm cli sync");
    expect(result.out).toContain("EXAMPLES");
    expect(result.err).toBe("");
  }, 30_000);
});

test("version output comes from package metadata", async () => {
  const { version } = JSON.parse(await readFile(join(cliRoot, "package.json"), "utf8"));
  const result = invoke(["--version"]);
  expect(result.code).toBe(0);
  expect(result.out).toContain(`@monii/cli/${version}`);
}, 30_000);

test.each([
  { args: ["missing"], invocation: "missing" },
  { args: ["--unknown"], invocation: "--unknown" },
  { args: ["sync", "--unknown"], invocation: "sync --unknown" },
  { args: ["sync", "extra"], invocation: "sync extra" },
  { args: ["--", "sync", "extra"], invocation: "-- sync extra" },
  { args: ["sync", "--", "--help"], invocation: "sync -- --help" },
  { args: ["--", "sync", "--", "--help"], invocation: "-- sync -- --help" },
  { args: ["--", "--", "sync"], invocation: "-- -- sync" },
])("rejects $invocation before synchronization", ({ args }) => {
  const result = invoke(args);
  expect(result.code).not.toBe(0);
  expect(result.err).toMatch(/not found|Unexpected|Nonexistent/i);
}, 30_000);

test.each([
  {
    args: ["cli", "--", "sync", "--help"],
    invocation: "the root pnpm script",
  },
  {
    args: ["--filter", "@monii/cli", "cli", "--", "sync", "--help"],
    invocation: "the filtered cron command",
  },
])("forwards sync help arguments through $invocation", ({ args }) => {
  const result = invoke(args, { pnpm: true, cwd: root });
  expect(result.code).toBe(0);
  expect(result.out).toContain("pnpm cli sync");
}, 30_000);

test("discovers a nested TypeScript command without registration", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "monii-cli-"));
  try {
    await cp(join(cliRoot, "package.json"), join(fixture, "package.json"));
    await mkdir(join(fixture, "src/commands/accounts"), { recursive: true });
    await cp(join(cliRoot, "src/index.ts"), join(fixture, "src/index.ts"));
    await cp(join(cliRoot, "src/cli.ts"), join(fixture, "src/cli.ts"));
    await symlink(join(cliRoot, "node_modules"), join(fixture, "node_modules"), "dir");
    await writeFile(join(fixture, "src/commands/accounts/list.ts"), `
      import { Command } from "@oclif/core";
      export default class List extends Command {
        static description = "List fixture accounts";
        async run() {
          await this.parse(List);
          this.log("fixture discovered");
        }
      }
    `);
    const help = invoke(["help", "accounts", "list"], { cwd: fixture, nodeEnv: "production" });
    expect(help.code).toBe(0);
    expect(help.out).toContain("pnpm cli accounts list");
    const result = invoke(["accounts", "list"], { cwd: fixture, nodeEnv: "production" });
    expect(result.code).toBe(0);
    expect(result.out).toContain("fixture discovered");
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
}, 45_000);
