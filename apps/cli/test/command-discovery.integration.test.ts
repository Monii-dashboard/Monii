import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, it } from "@testkit/integration";

import { cliRoot, invokeCli } from "./invoke-cli";

it("discovers a nested TypeScript command without registration", async () => {
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
    const help = invokeCli(["help", "accounts", "list"], {
      cwd: fixture,
      nodeEnv: "production",
    });
    expect(help.code).toBe(0);
    expect(help.out).toContain("pnpm cli accounts list");
    const result = invokeCli(["accounts", "list"], {
      cwd: fixture,
      nodeEnv: "production",
    });
    expect(result.code).toBe(0);
    expect(result.out).toContain("fixture discovered");
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
}, 45_000);
