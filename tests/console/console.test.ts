import { createRequire } from "node:module";
import { PassThrough } from "node:stream";

import { expect, test } from "vitest";

import { runWithOperationContext } from "@monii/runtime/operation";

const require = createRequire(import.meta.url);
require("../../apps/console/src/preflight.cjs");

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

test("runs TypeScript code and private imports inside one console operation", async () => {
  const { startMoniiConsole } = await import("../../apps/console/src/console");
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
    await evaluate("const answer: number = 42");
    await evaluate("answer");
    await evaluate("monii.runtime.context.getOperationContext()");
    await evaluate(".clear");
    await evaluate("typeof monii");
    await evaluate("monii.runtime.context.getOperationContext()");
    await evaluate(
      'const privateModule = await import("./packages/server/src/database/schema.ts")',
    );
    await evaluate('"financialAccounts" in privateModule');
    input.write(".exit\n");

    await consoleExited;
  });

  expect(writtenOutput).toContain("Monii TypeScript console (console-");
  expect(writtenOutput).toContain("@monii/server/database");
  expect(writtenOutput).toMatch(/\b42\b/);
  expect(writtenOutput).toContain("surface: 'console'");
  expect(writtenOutput).toContain("'object'");
  expect(writtenOutput).toContain("true");
  const actionIds = [
    ...writtenOutput.matchAll(/console-[0-9a-f-]{36}/g),
  ].map(([actionId]) => actionId);
  expect(new Set(actionIds).size).toBe(1);
}, 20_000);
