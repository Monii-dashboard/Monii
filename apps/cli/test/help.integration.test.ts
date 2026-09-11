import { describe, expect, it } from "@testkit/integration";

import { invokeCli } from "./invoke-cli";

describe.each(["development", "production"])("help without financial configuration (%s)", (nodeEnv) => {
  it.each([
    { args: [], invocation: "no arguments" },
    { args: ["--help"], invocation: "--help" },
    { args: ["-h"], invocation: "-h" },
    { args: ["help"], invocation: "help" },
  ])("prints root help for $invocation", ({ args }) => {
    const result = invokeCli(args, { nodeEnv });
    expect(result.code).toBe(0);
    expect(result.out).toContain("pnpm cli [COMMAND]");
    expect(result.out).toMatch(/sync\s+Synchronize/);
    expect(result.err).toBe("");
  }, 30_000);

  it.each([
    { args: ["sync", "--help"], invocation: "sync --help" },
    { args: ["sync", "-h"], invocation: "sync -h" },
    { args: ["help", "sync"], invocation: "help sync" },
  ])("prints sync help for $invocation", ({ args }) => {
    const result = invokeCli(args, { nodeEnv });
    expect(result.code).toBe(0);
    expect(result.out).toContain("pnpm cli sync");
    expect(result.out).toContain("EXAMPLES");
    expect(result.err).toBe("");
  }, 30_000);
});
