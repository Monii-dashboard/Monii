import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

export const workspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));
export const cliRoot = join(workspaceRoot, "apps/cli");

export function invokeCli(
  args: string[],
  options: { cwd?: string; nodeEnv?: string; pnpm?: boolean } = {},
) {
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
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`CLI process terminated with ${result.signal}`);
  if (result.stdout.includes('"event":"sync.')) {
    throw new Error("CLI invocation unexpectedly started synchronization");
  }
  return { code: result.status, out: result.stdout, err: result.stderr };
}
