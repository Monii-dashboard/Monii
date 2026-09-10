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
  add(root, "accounts");
  add(root, "postgres", "node", { "@monii/accounts": "workspace:*" });
  add(root, "runtime", "node");
  add(root, "web", "node", { "@monii/postgres": "workspace:*" }, "apps");
  return root;
}
function lint(root, code, filename = "packages/accounts/src/example.js") {
  return new Linter({ cwd: root }).verify(code, workspaceLintConfig(root), { filename: path.join(root, filename) });
}

test("accepts the current repository workspace graph", () => {
  validateWorkspace(discoverWorkspace(fileURLToPath(new URL("../../", import.meta.url))));
});

test("allows local code and compatible declared dependencies", () => {
  const root = workspace();
  expect(lint(root, 'export { value } from "@monii/accounts";', "packages/postgres/src/index.js")).toEqual([]);
  expect(lint(root, 'import { value } from "./local.js";')).toEqual([]);
  expect(lint(root, 'const config = { env: "provided" }; config.env;')).toEqual([]);
  add(root, "backend", "node", { "@monii/postgres": "workspace:*" });
  expect(lint(root, 'import "@monii/postgres";', "packages/backend/src/index.js")).toEqual([]);
});

test.each([
  { caseName: "missing monii.platform", platform: undefined },
  { caseName: "unsupported browser platform", platform: "browser" },
  { caseName: "null platform", platform: null },
  { caseName: "numeric platform", platform: 42 },
])("rejects $caseName", ({ platform }) => {
  const root = workspace();
  add(root, "invalid", platform === undefined ? "portable" : platform);
  if (platform === undefined) writeFileSync(path.join(root, "packages/invalid/package.json"), '{"name":"@monii/invalid"}');
  expect(() => validateWorkspace(discoverWorkspace(root))).toThrow(/monii.platform/);
});

test("rejects a portable package dependency on a Node package", () => {
  const root = workspace();
  add(root, "accounts", "portable", { "@monii/postgres": "workspace:*" });
  expect(() => validateWorkspace(discoverWorkspace(root))).toThrow(/portable/);
});

test("rejects a cycle in the workspace dependency graph", () => {
  const root = workspace();
  add(root, "accounts", "node", { "@monii/postgres": "workspace:*" });
  expect(() => validateWorkspace(discoverWorkspace(root))).toThrow(/cycle/);
});

test("rejects application-domain coupling from runtime", () => {
  const root = workspace();
  add(root, "accounts");
  add(root, "runtime", "node", { "@monii/accounts": "workspace:*" });
  expect(() => validateWorkspace(discoverWorkspace(root))).toThrow(/Runtime/);
});

test("rejects a package dependency on an application", () => {
  const root = workspace();
  add(root, "runtime", "node", { "@monii/web": "workspace:*" });
  expect(() => validateWorkspace(discoverWorkspace(root))).toThrow(/app/);
});

test("rejects package exports of isolated test support", () => {
  const root = workspace();
  writeFileSync(path.join(root, "packages/accounts/package.json"), JSON.stringify({
    name: "@monii/accounts",
    monii: { platform: "portable" },
    exports: {
      ".": "./src/index.ts",
      "./testing": "./test-support/index.ts",
    },
  }));
  expect(() => validateWorkspace(discoverWorkspace(root))).toThrow(/test-support/);
});

test.each([
  'import "node:fs";', 'import "fs/promises";', 'export * from "next/server";',
  'export { buildSchema } from "type-graphql";', 'void import("drizzle-orm");',
  'void import("@monii/runtime/public");', 'import "@monii/postgres";',
  'void import(`node:fs`);', 'import "../node_modules/@monii/postgres/src/index.js";',
  'process.env.VALUE;', 'process["env"].VALUE;', 'const { env } = process;',
  'globalThis.process.env.VALUE;', 'Buffer.from("value");', 'import.meta.env.VALUE;',
  'globalThis["process"];', 'import.meta["env"].VALUE;',
  'import "../../postgres/src/index.js";', 'export * from "../../postgres/src/index.js";',
  'void import("../../postgres/src/index.js");', 'import "../../../tooling/helper.js";',
])("rejects portable boundary bypass: %s", (code) => {
  expect(lint(workspace(), code).some((message) => message.severity === 2)).toBe(true);
});

test.each([
  'import "@monii/accounts/src/index";', 'export * from "@monii/accounts/private";',
  'void import("../..//accounts/src/index.js");', 'import "../../../apps/web/src/page.js";',
])("rejects private source bypass: %s", (code) => {
  expect(lint(workspace(), code, "packages/postgres/src/example.js")).toHaveLength(1);
});

test("retains web postgres restriction for static and dynamic imports", () => {
  const root = workspace();
  for (const code of ['import "@monii/postgres";', 'void import("@monii/postgres");', 'export * from "@monii/postgres";']) {
    expect(lint(root, code, "apps/web/src/page.js")).toHaveLength(1);
    expect(lint(root, code, "apps/web/src/app/api/route.js")).toEqual([]);
  }
});

test("allows testkit only from integration tests and isolated test support", () => {
  const root = workspace();
  expect(lint(root, 'import "@testkit/postgres";')).toHaveLength(1);
  expect(lint(
    root,
    'import { it } from "@testkit/integration"; import "@testkit/postgres";',
    "packages/accounts/src/example.integration.test.js",
  )).toEqual([]);
  expect(lint(
    root,
    'import "@testkit/postgres";',
    "packages/accounts/test-support/index.js",
  )).toEqual([]);
});

test("requires integration tests to use the integration test API", () => {
  const root = workspace();
  const filename = "packages/accounts/src/example.integration.test.js";
  expect(lint(root, 'import { it } from "vitest";', filename)).toHaveLength(2);
  expect(lint(root, 'import { it } from "@testkit/integration";', filename)).toEqual([]);
});

test("allows Node adapters only in portable integration and test-support files", () => {
  const root = workspace();
  expect(lint(
    root,
    'import { it } from "@testkit/integration"; import "@monii/postgres/public";',
    "packages/accounts/src/example.integration.test.js",
  )).toEqual([]);
  expect(lint(
    root,
    'import "@monii/postgres/public";',
    "packages/accounts/test-support/index.js",
  )).toEqual([]);
});

test("discovers a new package and applies policy without central configuration", () => {
  const root = workspace();
  add(root, "reporting", "portable", { "@monii/accounts": "workspace:*" });
  expect(discoverWorkspace(root).map((pkg) => pkg.name)).toContain("@monii/reporting");
  expect(lint(root, 'import "@monii/accounts/public";', "packages/reporting/src/index.js")).toEqual([]);
  expect(lint(root, 'void import("node:crypto");', "packages/reporting/src/index.js")).toHaveLength(1);
  add(root, "reporting", "portable", { "@monii/runtime": "workspace:*" });
  expect(() => workspaceLintConfig(root)).toThrow(/portable/);
});

test.each(["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"])("checks %s edges", (field) => {
  const root = workspace();
  const packages = discoverWorkspace(root);
  const accounts = packages.find((pkg) => pkg.name === "@monii/accounts");
  accounts[field] = { "@monii/runtime": "workspace:*" };
  expect(() => validateWorkspace(packages)).toThrow(/portable/);
});

test("rejects an undeclared workspace import", () => {
  const root = workspace();
  expect(lint(root, 'import "@monii/runtime/public";', "packages/postgres/src/index.js")).toHaveLength(1);
});

test("rejects a dependency on an unknown workspace package", () => {
  const root = workspace();
  add(root, "missing", "portable", { "@monii/absent": "workspace:*" });
  expect(() => validateWorkspace(discoverWorkspace(root))).toThrow(/unknown workspace/);
});
