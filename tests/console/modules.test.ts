import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, expect, test } from "vitest";

import {
  findWorkspaceRoot,
  loadWorkspaceModules,
} from "../../apps/console/src/modules";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

async function createWorkspace(
  packages: Record<string, Record<string, unknown>>,
): Promise<string> {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "monii-console-"));
  temporaryDirectories.push(workspaceRoot);
  await writeFile(path.join(workspaceRoot, "pnpm-workspace.yaml"), "packages: []\n");

  for (const [directory, manifest] of Object.entries(packages)) {
    const packageDirectory = path.join(workspaceRoot, "packages", directory);
    await mkdir(packageDirectory, { recursive: true });
    await writeFile(
      path.join(packageDirectory, "package.json"),
      JSON.stringify(manifest),
    );
  }

  return workspaceRoot;
}

test("discovers workspace package exports and preserves partial usefulness", async () => {
  const workspaceRoot = await createWorkspace({
    wealth: {
      name: "@monii/wealth",
      exports: {
        ".": "./src/index.ts",
        "./useCases": { import: "./src/use-cases.ts" },
      },
    },
    server: {
      name: "@monii/server",
      exports: {
        "./broken": "./src/broken.ts",
        "./database": "./src/database.ts",
        "./features/*": "./src/features/*.ts",
      },
    },
  });
  const importedModules: Record<string, Record<string, unknown> | Error> = {
    "wealth/src/index.ts": { calculateWealth: () => 42 },
    "wealth/src/use-cases.ts": { synchronize: "sync" },
    "server/src/broken.ts": new Error("missing provider configuration"),
    "server/src/database.ts": { getDb: () => "database" },
  };

  const monii = await loadWorkspaceModules(workspaceRoot, {
    importModule: async (moduleUrl) => {
      const relativePath = path
        .relative(path.join(workspaceRoot, "packages"), fileURLToPath(moduleUrl))
        .split(path.sep)
        .join("/");
      const loaded = importedModules[relativePath];

      if (loaded instanceof Error) throw loaded;
      if (!loaded) throw new Error(`Unexpected module ${relativePath}`);

      return loaded;
    },
  });
  const wealth = monii.wealth as Record<string, unknown>;
  const server = monii.server as Record<string, Record<string, unknown>>;

  expect(wealth.calculateWealth).toBeTypeOf("function");
  expect(wealth.useCases).toEqual({ synchronize: "sync" });
  expect(server.database.getDb).toBeTypeOf("function");
  expect(monii.$console.loadedModules).toEqual([
    "@monii/server/database",
    "@monii/wealth",
    "@monii/wealth/useCases",
  ]);
  expect(monii.$console.loadErrors["@monii/server/broken"]?.message).toBe(
    "missing provider configuration",
  );
  expect(monii.$console.loadErrors["@monii/server/features/*"]?.message).toContain(
    "unsupported wildcard",
  );
  expect(Object.isFrozen(monii)).toBe(true);
  expect(Object.isFrozen(wealth)).toBe(true);
});

test("reports namespace collisions without replacing the first export", async () => {
  const workspaceRoot = await createWorkspace({
    wealth: {
      name: "@monii/wealth",
      exports: {
        ".": "./src/index.ts",
        "./reports": "./src/reports.ts",
      },
    },
  });

  const monii = await loadWorkspaceModules(workspaceRoot, {
    importModule: async (moduleUrl) =>
      moduleUrl.endsWith("/index.ts")
        ? { reports: "root export" }
        : { createReport: () => undefined },
  });
  const wealth = monii.wealth as Record<string, unknown>;

  expect(wealth.reports).toBe("root export");
  expect(monii.$console.loadedModules).toEqual(["@monii/wealth"]);
  expect(monii.$console.loadErrors["@monii/wealth/reports"]?.message).toContain(
    "collides",
  );
});

test("finds the workspace root from a nested package directory", async () => {
  const workspaceRoot = await createWorkspace({});
  const nestedDirectory = path.join(workspaceRoot, "apps", "console", "src");
  await mkdir(nestedDirectory, { recursive: true });

  await expect(findWorkspaceRoot(nestedDirectory)).resolves.toBe(workspaceRoot);
});
