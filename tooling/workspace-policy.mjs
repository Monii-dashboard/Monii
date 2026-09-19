import { readFileSync, readdirSync } from "node:fs";
import { builtinModules } from "node:module";
import path from "node:path";

const dependencyFields = [
  "dependencies", "devDependencies", "peerDependencies", "optionalDependencies",
];
const adapters = ["next", "graphql", "type-graphql", "drizzle-orm", "postgres"];
const nodeModules = new Set(builtinModules.map((name) => name.replace(/^node:/, "")));

// These are the flat workspace globs in pnpm-workspace.yaml, not a package list.
export function discoverWorkspace(root) {
  return ["apps", "packages"].flatMap((group) =>
    readdirSync(path.join(root, group), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const directory = path.join(root, group, entry.name);
        const manifest = JSON.parse(readFileSync(path.join(directory, "package.json"), "utf8"));
        return { ...manifest, directory, group };
      }),
  );
}

function dependencies(pkg) {
  return Object.assign({}, ...dependencyFields.map((field) => pkg[field]));
}

function exposesTestSupport(value, key = "") {
  if (/(^|[./])test-support([/.]|$)/.test(key)) return true;
  if (typeof value === "string") return /(^|[./])test-support([/.]|$)/.test(value);
  if (Array.isArray(value)) return value.some((entry) => exposesTestSupport(entry));
  if (value && typeof value === "object") {
    return Object.entries(value).some(([entryKey, entryValue]) =>
      exposesTestSupport(entryValue, entryKey)
    );
  }
  return false;
}

export function validateWorkspace(packages) {
  const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));
  if (byName.size !== packages.length) throw new Error("Duplicate workspace package name");
  for (const pkg of packages) {
    if (!pkg.name || !["portable", "node"].includes(pkg.monii?.platform)) {
      throw new Error(`${pkg.name ?? pkg.directory}: missing or invalid monii.platform`);
    }
    if (exposesTestSupport(pkg.exports)) {
      throw new Error(`${pkg.name}: test-support must not be exposed through package exports`);
    }
    for (const [name, version] of Object.entries(dependencies(pkg))) {
      const target = byName.get(name);
      if (!target && version.startsWith("workspace:")) {
        throw new Error(`${pkg.name}: unknown workspace dependency ${name}`);
      }
      if (!target) continue;
      if (target.group === "apps") throw new Error(`${pkg.name}: cannot depend on app ${name}`);
      if (pkg.monii.platform === "portable" && target.monii?.platform !== "portable") {
        throw new Error(`${pkg.name}: portable package cannot depend on Node package ${name}`);
      }
      if (pkg.name === "@monii/runtime") {
        throw new Error("Runtime must remain independent of workspace packages");
      }
    }
  }
  const visited = new Set();
  function visit(pkg, ancestors) {
    if (ancestors.includes(pkg.name)) {
      throw new Error(`Workspace dependency cycle: ${[...ancestors, pkg.name].join(" -> ")}`);
    }
    if (visited.has(pkg.name)) return;
    for (const name of Object.keys(dependencies(pkg))) {
      if (byName.has(name)) visit(byName.get(name), [...ancestors, pkg.name]);
    }
    visited.add(pkg.name);
  }
  packages.forEach((pkg) => visit(pkg, []));
}

function contains(directory, filename) {
  const relative = path.relative(directory, filename);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function publicEntry(pkg, specifier) {
  const key = specifier === pkg.name ? "." : `.${specifier.slice(pkg.name.length)}`;
  const exports = pkg.exports;
  if (!exports) return false;
  if (typeof exports === "string" || Array.isArray(exports)) return key === ".";
  if (!Object.keys(exports).some((entry) => entry.startsWith("."))) return key === ".";
  return Object.hasOwn(exports, key) && exports[key] !== null;
}

export function workspaceImportRule(packages) {
  return {
    meta: { type: "problem", schema: [], messages: { boundary: "{{reason}}" } },
    create(context) {
      const filename = path.resolve(context.filename);
      const owner = packages.find((pkg) => contains(pkg.directory, filename));
      const isIntegrationTest = /\.integration\.test\.[cm]?[jt]sx?$/.test(filename);
      const isTestSupport = filename.split(path.sep).includes("test-support") ||
        filename.includes(`${path.sep}tests${path.sep}support${path.sep}testkit${path.sep}`);
      const mayUseTestkit = isIntegrationTest || isTestSupport;
      let importsIntegrationTestApi = false;
      function check(node) {
        const specifier = node.type === "TemplateLiteral" && node.expressions.length === 0
          ? node.quasis[0].value.cooked
          : node.value;
        if (typeof specifier !== "string") return;
        if (specifier === "@testkit/integration") importsIntegrationTestApi = true;
        let reason;
        if (specifier.startsWith("@testkit/") && !mayUseTestkit) {
          reason = "Testkit imports are allowed only from integration tests and isolated test-support modules.";
        }
        const target = packages.find((pkg) => specifier === pkg.name || specifier.startsWith(`${pkg.name}/`));
        if (specifier.startsWith(".") || path.isAbsolute(specifier)) {
          const resolved = path.resolve(path.dirname(filename), specifier);
          if (owner && (!contains(owner.directory, resolved) || resolved.split(path.sep).includes("node_modules"))) {
            reason = "Cross-package imports must use public package entry points; app internals stay in their app.";
          }
        } else if (target) {
          if (target.group === "apps" && owner !== target) reason = "Apps must not import another app's internals.";
          else if (!publicEntry(target, specifier)) reason = "Use an explicit public package export.";
          else if (owner && owner !== target && !mayUseTestkit && !Object.hasOwn(dependencies(owner), target.name)) reason = "Declare workspace dependencies in the owning manifest.";
          else if (owner?.monii.platform === "portable" && !mayUseTestkit && target.monii.platform !== "portable") reason = "Portable packages cannot import Node packages.";
        }
        if (
          specifier === "@monii/postgres/model" &&
          owner?.name !== "@monii/postgres" &&
          !filename.includes(`${path.sep}src${path.sep}models${path.sep}`)
        ) {
          reason = "Only capability-owned model definitions may import the shared model factory.";
        }
        if (owner?.monii.platform === "portable" && !mayUseTestkit && (
          specifier.startsWith("node:") || nodeModules.has(specifier) ||
          adapters.some((adapter) => specifier === adapter || specifier.startsWith(`${adapter}/`))
        )) reason = "Keep portable packages independent of Node APIs, frameworks, and concrete adapters.";
        if (
          owner?.name === "@monii/web" &&
          !mayUseTestkit &&
          !contains(path.join(owner.directory, "src/app/api"), filename) &&
          target?.monii?.platform === "node" &&
          target.name !== "@monii/runtime"
        ) {
          reason = "Import Node adapters only from a server-side composition root.";
        }
        if (reason) context.report({ node, messageId: "boundary", data: { reason } });
      }
      return {
        ImportDeclaration: (node) => {
          check(node.source);
          if (
            isIntegrationTest &&
            node.source.value === "vitest" &&
            node.specifiers.some((specifier) =>
              specifier.type === "ImportSpecifier" &&
              ["it", "test"].includes(specifier.imported.name)
            )
          ) {
            context.report({
              node,
              messageId: "boundary",
              data: {
                reason: "Integration tests must import it from @testkit/integration, not from vitest.",
              },
            });
          }
        },
        ExportNamedDeclaration: (node) => { if (node.source) check(node.source); },
        ExportAllDeclaration: (node) => check(node.source),
        ImportExpression: (node) => check(node.source),
        CallExpression: (node) => {
          if (node.callee.name === "require" && node.arguments[0]) check(node.arguments[0]);
        },
        "Program:exit": (node) => {
          if (isIntegrationTest && !importsIntegrationTestApi) {
            context.report({
              node,
              messageId: "boundary",
              data: {
                reason: "Integration tests must import their test API from @testkit/integration.",
              },
            });
          }
        },
      };
    },
  };
}

export function workspaceLintConfig(root) {
  const packages = discoverWorkspace(root);
  validateWorkspace(packages);
  return [
    {
      files: ["**/*.{js,mjs,cjs,ts,tsx,mts,cts}"],
      plugins: { workspace: { rules: { imports: workspaceImportRule(packages) } } },
      rules: { "workspace/imports": "error" },
    },
    ...packages.filter((pkg) => pkg.monii.platform === "portable").map((pkg) => ({
      files: [`${path.relative(root, pkg.directory)}/**/*.{js,mjs,cjs,ts,tsx,mts,cts}`],
      ignores: [
        `${path.relative(root, pkg.directory)}/**/*.integration.test.{js,mjs,cjs,ts,tsx,mts,cts}`,
        `${path.relative(root, pkg.directory)}/test-support/**/*.{js,mjs,cjs,ts,tsx,mts,cts}`,
      ],
      rules: {
        "no-restricted-globals": ["error", "process", "Buffer", "__dirname", "__filename", "require", "global"],
        "no-restricted-syntax": ["error", {
          selector: "MemberExpression[object.type='MetaProperty'][property.name='env'], MemberExpression[object.type='MetaProperty'][property.value='env'], MemberExpression[object.name='globalThis'][property.name=/^(process|Buffer|global)$/], MemberExpression[object.name='globalThis'][property.value=/^(process|Buffer|global)$/]",
          message: "Pass configured dependencies or values into portable code instead of reading the environment or Node globals.",
        }],
      },
    })),
  ];
}
