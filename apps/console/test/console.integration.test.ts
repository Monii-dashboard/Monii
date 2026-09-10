import { createRequire } from "node:module";
import { PassThrough } from "node:stream";

import { expect, test } from "vitest";

import { runWithOperationContext } from "@monii/runtime/operation";

const require = createRequire(import.meta.url);
require("../src/preflight.cjs");

function waitFor(
  predicate: () => boolean,
  describeExpectation: string,
  timeoutMilliseconds = 10_000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const interval = setInterval(() => {
      if (predicate()) {
        clearInterval(interval);
        resolve();
      } else if (Date.now() - startedAt >= timeoutMilliseconds) {
        clearInterval(interval);
        reject(new Error(`Timed out waiting for ${describeExpectation}`));
      }
    }, 10);
  });
}

async function runConsoleSession(commands: readonly string[]): Promise<string> {
  const { startMoniiConsole } = await import("../src/console");
  const input = new PassThrough();
  const output = new PassThrough();
  let writtenOutput = "";
  let outputOffset = 0;

  output.setEncoding("utf8");
  output.on("data", (chunk: string) => {
    writtenOutput += chunk;
  });

  const waitForNextPrompt = async (after: string) => {
    await waitFor(
      () => writtenOutput.indexOf("monii> ", outputOffset) >= 0,
      `the console prompt after ${after}`,
    );
    outputOffset = writtenOutput.length;
  };
  const evaluate = async (code: string) => {
    input.write(`${code}\n`);
    await waitForNextPrompt(JSON.stringify(code));
  };

  await runWithOperationContext({ surface: "console" }, async () => {
    const consoleExited = startMoniiConsole({ input, output, terminal: false });

    await waitForNextPrompt("startup");
    for (const command of commands) await evaluate(command);
    input.write(".exit\n");

    await consoleExited;
  });

  return writtenOutput;
}

test("evaluates TypeScript and keeps preloaded modules after clearing bindings", async () => {
  const writtenOutput = await runConsoleSession([
    "const answer: number = 42",
    "answer",
    'typeof monii["wealth-calculation"].calculateWealthSnapshot',
    ".clear",
    "typeof monii",
  ]);

  expect(writtenOutput).toContain("Monii TypeScript console (console-");
  expect(writtenOutput).toContain("@monii/postgres/schema");
  expect(writtenOutput).toContain("@monii/wealth-calculation");
  expect(writtenOutput).toContain("'function'");
  expect(writtenOutput).toMatch(/\b42\b/);
  expect(writtenOutput).toContain("'object'");
}, 20_000);

test("keeps one operation context before and after clearing bindings", async () => {
  const writtenOutput = await runConsoleSession([
    "monii.runtime.context.getOperationContext()",
    ".clear",
    "monii.runtime.context.getOperationContext()",
  ]);

  expect(writtenOutput.match(/surface: 'console'/g)).toHaveLength(2);
  const actionIds = [
    ...writtenOutput.matchAll(/console-[0-9a-f-]{36}/g),
  ].map(([actionId]) => actionId);
  expect(new Set(actionIds).size).toBe(1);
}, 20_000);

test("imports a private TypeScript source file relative to the repository root", async () => {
  const writtenOutput = await runConsoleSession([
    'const privateModule = await import("./packages/accounts/src/account-valuation.ts")',
    '"decimalToScaledInteger" in privateModule',
  ]);

  expect(writtenOutput).toContain("true");
}, 20_000);
