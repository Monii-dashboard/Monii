import { expect, it } from "@testkit/integration";

import { invokeCli } from "./invoke-cli";

it("prints every supported help form without financial configuration", () => {
  const rootInvocations = [
    { args: [], invocation: "no arguments" },
    { args: ["--help"], invocation: "--help" },
    { args: ["-h"], invocation: "-h" },
    { args: ["help"], invocation: "help" },
  ];
  const syncInvocations = [
    { args: ["sync", "--help"], invocation: "sync --help" },
    { args: ["sync", "-h"], invocation: "sync -h" },
    { args: ["help", "sync"], invocation: "help sync" },
  ];

  for (const nodeEnv of ["development", "production"]) {
    for (const { args, invocation } of rootInvocations) {
      const result = invokeCli(args, { nodeEnv });
      expect(result.code, `${nodeEnv}: ${invocation}`).toBe(0);
      expect(result.out, `${nodeEnv}: ${invocation}`).toContain(
        "pnpm cli [COMMAND]",
      );
      expect(result.out, `${nodeEnv}: ${invocation}`).toMatch(
        /sync\s+Synchronize/,
      );
      expect(result.err, `${nodeEnv}: ${invocation}`).toBe("");
    }
    for (const { args, invocation } of syncInvocations) {
      const result = invokeCli(args, { nodeEnv });
      expect(result.code, `${nodeEnv}: ${invocation}`).toBe(0);
      expect(result.out, `${nodeEnv}: ${invocation}`).toContain("pnpm cli sync");
      expect(result.out, `${nodeEnv}: ${invocation}`).toContain("EXAMPLES");
      expect(result.err, `${nodeEnv}: ${invocation}`).toBe("");
    }
  }
}, 30_000);
