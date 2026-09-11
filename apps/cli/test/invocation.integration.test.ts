import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, it } from "@testkit/integration";

import { cliRoot, invokeCli, workspaceRoot } from "./invoke-cli";

it("prints the version from package metadata", async () => {
  const { version } = JSON.parse(await readFile(join(cliRoot, "package.json"), "utf8"));
  const result = invokeCli(["--version"]);
  expect(result.code).toBe(0);
  expect(result.out).toContain(`@monii/cli/${version}`);
}, 30_000);

it.each([
  { args: ["missing"], invocation: "missing" },
  { args: ["--unknown"], invocation: "--unknown" },
  { args: ["sync", "--unknown"], invocation: "sync --unknown" },
  { args: ["sync", "extra"], invocation: "sync extra" },
  { args: ["--", "sync", "extra"], invocation: "-- sync extra" },
  { args: ["sync", "--", "--help"], invocation: "sync -- --help" },
  { args: ["--", "sync", "--", "--help"], invocation: "-- sync -- --help" },
  { args: ["--", "--", "sync"], invocation: "-- -- sync" },
])("rejects $invocation before synchronization", ({ args }) => {
  const result = invokeCli(args);
  expect(result.code).not.toBe(0);
  expect(result.err).toMatch(/not found|Unexpected|Nonexistent/i);
}, 30_000);

it.each([
  {
    args: ["cli", "--", "sync", "--help"],
    invocation: "the root pnpm script",
  },
  {
    args: ["--filter", "@monii/cli", "cli", "--", "sync", "--help"],
    invocation: "the filtered cron command",
  },
])("forwards sync help arguments through $invocation", ({ args }) => {
  const result = invokeCli(args, { pnpm: true, cwd: workspaceRoot });
  expect(result.code).toBe(0);
  expect(result.out).toContain("pnpm cli sync");
}, 30_000);
