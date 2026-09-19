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

it("rejects every unsupported argument form before synchronization", () => {
  const invocations = [
  { args: ["missing"], invocation: "missing" },
  { args: ["--unknown"], invocation: "--unknown" },
  { args: ["sync", "--unknown"], invocation: "sync --unknown" },
  { args: ["sync", "extra"], invocation: "sync extra" },
  { args: ["--", "sync", "extra"], invocation: "-- sync extra" },
  { args: ["sync", "--", "--help"], invocation: "sync -- --help" },
  { args: ["--", "sync", "--", "--help"], invocation: "-- sync -- --help" },
  { args: ["--", "--", "sync"], invocation: "-- -- sync" },
  ];
  for (const { args, invocation } of invocations) {
    const result = invokeCli(args);
    expect(result.code, invocation).not.toBe(0);
    expect(result.err, invocation).toMatch(/not found|Unexpected|Nonexistent/i);
  }
}, 30_000);

it("forwards sync help through supported pnpm entry points", () => {
  const invocations = [
  {
    args: ["cli", "--", "sync", "--help"],
    invocation: "the root pnpm script",
  },
  {
    args: ["--filter", "@monii/cli", "cli", "--", "sync", "--help"],
    invocation: "the filtered cron command",
  },
  ];
  for (const { args, invocation } of invocations) {
    const result = invokeCli(args, { pnpm: true, cwd: workspaceRoot });
    expect(result.code, invocation).toBe(0);
    expect(result.out, invocation).toContain("pnpm cli sync");
  }
}, 30_000);
