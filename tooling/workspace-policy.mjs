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

export function validateWorkspace(packages) {
  const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));
  if (byName.size !== packages.length) throw new Error("Duplicate workspace package name");
  for (const pkg of packages) {
    if (!pkg.name || !["portable", "node"].includes(pkg.monii?.platform)) {
      throw new Error(`${pkg.name ?? pkg.directory}: missing or invalid monii.platform`);
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
      function check(node) {
        const specifier = node.type === "TemplateLiteral" && node.expressions.length === 0
          ? node.quasis[0].value.cooked
          : node.value;
        if (typeof specifier !== "string") return;
        let reason;
        const target = packages.find((pkg) => specifier === pkg.name || specifier.startsWith(`${pkg.name}/`));
        if (specifier.startsWith(".") || path.isAbsolute(specifier)) {
          const resolved = path.resolve(path.dirname(filename), specifier);
          if (owner && (!contains(owner.directory, resolved) || resolved.split(path.sep).includes("node_modules"))) {
            reason = "Cross-package imports must use public package entry points; app internals stay in their app.";
          }
        } else if (target) {
          if (target.group === "apps" && owner !== target) reason = "Apps must not import another app's internals.";
          else if (!publicEntry(target, specifier)) reason = "Use an explicit public package export.";
          else if (owner && owner !== target && !Object.hasOwn(dependencies(owner), target.name)) reason = "Declare workspace dependencies in the owning manifest.";
          else if (owner?.monii.platform === "portable" && target.monii.platform !== "portable") reason = "Portable packages cannot import Node packages.";
        }
        if (owner?.monii.platform === "portable" && (
          specifier.startsWith("node:") || nodeModules.has(specifier) ||
          adapters.some((adapter) => specifier === adapter || specifier.startsWith(`${adapter}/`))
        )) reason = "Keep portable packages independent of Node APIs, frameworks, and concrete adapters.";
        if (owner?.name === "@monii/web" && !contains(path.join(owner.directory, "src/app/api"), filename) && target?.name === "@monii/server") {
          reason = "Import server adapters only from a server-side composition root.";
        }
        if (reason) context.report({ node, messageId: "boundary", data: { reason } });
      }
      return {
        ImportDeclaration: (node) => check(node.source),
        ExportNamedDeclaration: (node) => { if (node.source) check(node.source); },
        ExportAllDeclaration: (node) => check(node.source),
        ImportExpression: (node) => check(node.source),
        CallExpression: (node) => {
          if (node.callee.name === "require" && node.arguments[0]) check(node.arguments[0]);
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
