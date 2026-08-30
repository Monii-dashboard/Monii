import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

type PackageManifest = {
  name?: unknown;
  exports?: unknown;
};

type ModuleNamespace = Record<string, unknown>;

type ModuleImporter = (moduleUrl: string) => Promise<ModuleNamespace>;

type LoadWorkspaceModulesOptions = {
  importModule?: ModuleImporter;
};

type ExportEntry = {
  key: string;
  specifier: string;
  target: string;
};

type ListedExports = {
  entries: ExportEntry[];
  errors: Array<{ error: Error; specifier: string }>;
};

type NamespaceNode = {
  children: Map<string, NamespaceNode>;
  exports: Map<string, unknown>;
  moduleSpecifier?: string;
};

export type ConsoleMetadata = Readonly<{
  loadedModules: readonly string[];
  loadErrors: Readonly<Record<string, Error>>;
}>;

export type MoniiNamespace = Readonly<
  Record<string, unknown> & {
    $console: ConsoleMetadata;
  }
>;

function createNamespaceNode(): NamespaceNode {
  return {
    children: new Map(),
    exports: new Map(),
  };
}

function normalizeError(error: unknown): Error {
  const normalized = new Error(
    error instanceof Error ? error.message : String(error),
  );

  if (error instanceof Error && error.stack) {
    normalized.stack = error.stack;
  }

  return Object.freeze(normalized);
}

function selectExportTarget(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    for (const candidate of value) {
      const target = selectExportTarget(candidate);

      if (target) {
        return target;
      }
    }

    return undefined;
  }

  if (!value || typeof value !== "object") {
    return undefined;
  }

  const conditions = value as Record<string, unknown>;

  for (const condition of ["node", "import", "default"]) {
    const target = selectExportTarget(conditions[condition]);

    if (target) {
      return target;
    }
  }

  return undefined;
}

function exportSpecifier(packageName: string, key: string): string {
  const subpath = key === "." ? "" : key.slice(2);

  return subpath ? `${packageName}/${subpath}` : packageName;
}

function listExportEntries(manifest: PackageManifest): ListedExports {
  if (typeof manifest.name !== "string" || !manifest.name.startsWith("@monii/")) {
    return { entries: [], errors: [] };
  }

  const packageName = manifest.name;
  const exportMap = manifest.exports;

  if (exportMap === undefined) {
    return { entries: [], errors: [] };
  }

  const keyedExports =
    exportMap && typeof exportMap === "object" && !Array.isArray(exportMap)
      ? (exportMap as Record<string, unknown>)
      : undefined;
  const keys = keyedExports ? Object.keys(keyedExports) : [];
  const hasSubpathKeys = keys.some(
    (key) => key === "." || key.startsWith("./"),
  );
  const hasConditionKeys = keys.some(
    (key) => key !== "." && !key.startsWith("./"),
  );

  if (hasSubpathKeys && hasConditionKeys) {
    throw new Error(
      `${packageName} mixes package subpaths and export conditions at the same level`,
    );
  }

  const entries = hasSubpathKeys
    ? keys.map((key) => [key, keyedExports?.[key]] as const)
    : [[".", exportMap] as const];

  const listedExports: ListedExports = { entries: [], errors: [] };

  for (const [key, value] of entries) {
    const specifier = exportSpecifier(packageName, key);

    try {
      if (key.includes("*")) {
        throw new Error(`${packageName} export ${key} uses an unsupported wildcard`);
      }

      const target = selectExportTarget(value);

      if (!target) {
        throw new Error(`${packageName} export ${key} has no importable target`);
      }

      listedExports.entries.push({
        key,
        specifier,
        target,
      });
    } catch (error) {
      listedExports.errors.push({
        error: normalizeError(error),
        specifier,
      });
    }
  }

  listedExports.entries.sort((left, right) => {
    if (left.key === ".") return -1;
    if (right.key === ".") return 1;
    return left.key.localeCompare(right.key);
  });
  listedExports.errors.sort((left, right) =>
    left.specifier.localeCompare(right.specifier),
  );

  return listedExports;
}

function resolveExportTarget(packageDirectory: string, entry: ExportEntry): string {
  if (!entry.target.startsWith("./")) {
    throw new Error(`${entry.specifier} target must be relative to its package`);
  }

  const targetPath = path.resolve(packageDirectory, entry.target);
  const relativeTarget = path.relative(packageDirectory, targetPath);

  if (relativeTarget.startsWith("..") || path.isAbsolute(relativeTarget)) {
    throw new Error(`${entry.specifier} target escapes its package directory`);
  }

  return pathToFileURL(targetPath).href;
}

function namespacePath(packageName: string, exportKey: string): string[] {
  const packageSegment = packageName.slice("@monii/".length);
  const subpathSegments = exportKey === "." ? [] : exportKey.slice(2).split("/");

  return [packageSegment, ...subpathSegments];
}

function attachModule(
  root: NamespaceNode,
  segments: readonly string[],
  specifier: string,
  moduleNamespace: ModuleNamespace,
): void {
  let node = root;

  for (const segment of segments) {
    if (!segment || segment === "." || segment === "..") {
      throw new Error(`${specifier} produces an invalid console namespace`);
    }

    if (node.exports.has(segment)) {
      throw new Error(
        `${specifier} namespace collides with exported value ${segments.join(".")}`,
      );
    }

    let child = node.children.get(segment);

    if (!child) {
      child = createNamespaceNode();
      node.children.set(segment, child);
    }

    node = child;
  }

  if (node.moduleSpecifier) {
    throw new Error(
      `${specifier} duplicates console namespace loaded from ${node.moduleSpecifier}`,
    );
  }

  for (const exportName of Object.keys(moduleNamespace)) {
    if (node.children.has(exportName)) {
      throw new Error(
        `${specifier} export ${exportName} collides with a package subpath`,
      );
    }
  }

  node.moduleSpecifier = specifier;

  for (const [exportName, exportedValue] of Object.entries(moduleNamespace)) {
    node.exports.set(exportName, exportedValue);
  }
}

function materializeNamespace(node: NamespaceNode): Readonly<Record<string, unknown>> {
  const result: Record<string, unknown> = {};

  for (const [name, value] of node.exports) {
    result[name] = value;
  }

  for (const [name, child] of node.children) {
    result[name] = materializeNamespace(child);
  }

  return Object.freeze(result);
}

export async function findWorkspaceRoot(startDirectory: string): Promise<string> {
  let currentDirectory = path.resolve(startDirectory);

  while (true) {
    try {
      await access(path.join(currentDirectory, "pnpm-workspace.yaml"));
      return currentDirectory;
    } catch {
      const parentDirectory = path.dirname(currentDirectory);

      if (parentDirectory === currentDirectory) {
        throw new Error(
          `Could not find pnpm-workspace.yaml above ${startDirectory}`,
        );
      }

      currentDirectory = parentDirectory;
    }
  }
}

export async function loadWorkspaceModules(
  workspaceRoot: string,
  { importModule = (moduleUrl) => import(moduleUrl) }: LoadWorkspaceModulesOptions = {},
): Promise<MoniiNamespace> {
  const namespaceRoot = createNamespaceNode();
  const loadedModules: string[] = [];
  const loadErrors: Record<string, Error> = {};
  const packagesDirectory = path.join(workspaceRoot, "packages");
  const packageDirectories = (await readdir(packagesDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const packageEntry of packageDirectories) {
    const packageDirectory = path.join(packagesDirectory, packageEntry.name);
    const manifestPath = path.join(packageDirectory, "package.json");
    let manifest: PackageManifest;

    try {
      manifest = JSON.parse(await readFile(manifestPath, "utf8")) as PackageManifest;
    } catch (error) {
      loadErrors[path.relative(workspaceRoot, manifestPath)] = normalizeError(error);
      continue;
    }

    if (typeof manifest.name !== "string" || !manifest.name.startsWith("@monii/")) {
      continue;
    }

    let listedExports: ListedExports;

    try {
      listedExports = listExportEntries(manifest);
    } catch (error) {
      loadErrors[manifest.name] = normalizeError(error);
      continue;
    }

    for (const { error, specifier } of listedExports.errors) {
      loadErrors[specifier] = error;
    }

    for (const exportEntry of listedExports.entries) {
      try {
        const moduleUrl = resolveExportTarget(packageDirectory, exportEntry);
        const moduleNamespace = await importModule(moduleUrl);

        attachModule(
          namespaceRoot,
          namespacePath(manifest.name, exportEntry.key),
          exportEntry.specifier,
          moduleNamespace,
        );
        loadedModules.push(exportEntry.specifier);
      } catch (error) {
        loadErrors[exportEntry.specifier] = normalizeError(error);
      }
    }
  }

  const packageNamespaces = materializeNamespace(namespaceRoot);
  const metadata: ConsoleMetadata = Object.freeze({
    loadedModules: Object.freeze([...loadedModules]),
    loadErrors: Object.freeze(loadErrors),
  });

  return Object.freeze({
    ...packageNamespaces,
    $console: metadata,
  });
}
