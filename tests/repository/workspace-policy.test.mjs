import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Linter } from "eslint";
import { afterEach, expect, test } from "vitest";
import { discoverWorkspace, validateWorkspace, workspaceLintConfig } from "../../tooling/workspace-policy.mjs";

const roots = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
function add(root, name, platform = "portable", dependencies = {}, group = "packages") {
  const directory = path.join(root, group, name);
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, "package.json"), JSON.stringify({
    name: `@monii/${name}`, monii: { platform }, dependencies,
    exports: { ".": "./src/index.ts", "./public": "./src/public.ts" },
  }));
}
function workspace() {
  const root = mkdtempSync(path.join(os.tmpdir(), "monii-policy-"));
  roots.push(root);
  mkdirSync(path.join(root, "apps"));
  mkdirSync(path.join(root, "packages"));
  add(root, "wealth");
  add(root, "server", "node", { "@monii/wealth": "workspace:*" });
  add(root, "runtime", "node");
  add(root, "web", "node", { "@monii/server": "workspace:*" }, "apps");
  return root;
}
function lint(root, code, filename = "packages/wealth/src/example.js") {
  return new Linter({ cwd: root }).verify(code, workspaceLintConfig(root), { filename: path.join(root, filename) });
}

test("accepts the repository graph and compatible declared dependencies", () => {
  validateWorkspace(discoverWorkspace(fileURLToPath(new URL("../../", import.meta.url))));
  const root = workspace();
  expect(lint(root, 'export { value } from "@monii/wealth";', "packages/server/src/index.js")).toEqual([]);
  expect(lint(root, 'import { value } from "./local.js";')).toEqual([]);
  expect(lint(root, 'const config = { env: "provided" }; config.env;')).toEqual([]);
  add(root, "backend", "node", { "@monii/server": "workspace:*" });
  expect(lint(root, 'import "@monii/server";', "packages/backend/src/index.js")).toEqual([]);
});

test.each([undefined, "browser", null, 42])("rejects invalid platform %s", (platform) => {
  const root = workspace();
  add(root, "invalid", platform === undefined ? "portable" : platform);
  if (platform === undefined) writeFileSync(path.join(root, "packages/invalid/package.json"), '{"name":"@monii/invalid"}');
  expect(() => validateWorkspace(discoverWorkspace(root))).toThrow(/monii.platform/);
});

test("rejects incompatible dependencies, cycles, runtime coupling, and app dependencies", () => {
  const root = workspace();
  add(root, "wealth", "portable", { "@monii/server": "workspace:*" });
  expect(() => validateWorkspace(discoverWorkspace(root))).toThrow(/portable/);
  add(root, "wealth", "node", { "@monii/server": "workspace:*" });
  expect(() => validateWorkspace(discoverWorkspace(root))).toThrow(/cycle/);
  add(root, "wealth");
  add(root, "runtime", "node", { "@monii/wealth": "workspace:*" });
  expect(() => validateWorkspace(discoverWorkspace(root))).toThrow(/Runtime/);
  add(root, "runtime", "node", { "@monii/web": "workspace:*" });
  expect(() => validateWorkspace(discoverWorkspace(root))).toThrow(/app/);
});

test.each([
  'import "node:fs";', 'import "fs/promises";', 'export * from "next/server";',
  'export { buildSchema } from "type-graphql";', 'void import("drizzle-orm");',
  'void import("@monii/runtime/public");', 'import "@monii/server";',
  'void import(`node:fs`);', 'import "../node_modules/@monii/server/src/index.js";',
  'process.env.VALUE;', 'process["env"].VALUE;', 'const { env } = process;',
  'globalThis.process.env.VALUE;', 'Buffer.from("value");', 'import.meta.env.VALUE;',
  'globalThis["process"];', 'import.meta["env"].VALUE;',
  'import "../../server/src/index.js";', 'export * from "../../server/src/index.js";',
  'void import("../../server/src/index.js");', 'import "../../../tooling/helper.js";',
])("rejects portable boundary bypass: %s", (code) => {
  expect(lint(workspace(), code).some((message) => message.severity === 2)).toBe(true);
});

test.each([
  'import "@monii/wealth/src/index";', 'export * from "@monii/wealth/private";',
  'void import("../..//wealth/src/index.js");', 'import "../../../apps/web/src/page.js";',
])("rejects private source bypass: %s", (code) => {
  expect(lint(workspace(), code, "packages/server/src/example.js")).toHaveLength(1);
});

test("retains web server restriction for static and dynamic imports", () => {
  const root = workspace();
  for (const code of ['import "@monii/server";', 'void import("@monii/server");', 'export * from "@monii/server";']) {
    expect(lint(root, code, "apps/web/src/page.js")).toHaveLength(1);
    expect(lint(root, code, "apps/web/src/app/api/route.js")).toEqual([]);
  }
});

test("discovers a new package and applies policy without central configuration", () => {
  const root = workspace();
  add(root, "reporting", "portable", { "@monii/wealth": "workspace:*" });
  expect(discoverWorkspace(root).map((pkg) => pkg.name)).toContain("@monii/reporting");
  expect(lint(root, 'import "@monii/wealth/public";', "packages/reporting/src/index.js")).toEqual([]);
  expect(lint(root, 'void import("node:crypto");', "packages/reporting/src/index.js")).toHaveLength(1);
  add(root, "reporting", "portable", { "@monii/runtime": "workspace:*" });
  expect(() => workspaceLintConfig(root)).toThrow(/portable/);
});

test.each(["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"])("checks %s edges", (field) => {
  const root = workspace();
  const packages = discoverWorkspace(root);
  const wealth = packages.find((pkg) => pkg.name === "@monii/wealth");
  wealth[field] = { "@monii/runtime": "workspace:*" };
  expect(() => validateWorkspace(packages)).toThrow(/portable/);
});

test("rejects undeclared imports and unresolved workspace dependencies", () => {
  const root = workspace();
  expect(lint(root, 'import "@monii/runtime/public";', "packages/server/src/index.js")).toHaveLength(1);
  add(root, "missing", "portable", { "@monii/absent": "workspace:*" });
  expect(() => validateWorkspace(discoverWorkspace(root))).toThrow(/unknown workspace/);
});
