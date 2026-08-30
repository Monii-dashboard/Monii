import repl, { type REPLServer } from "node:repl";

import { getOperationContext } from "@monii/runtime/context";

import {
  findWorkspaceRoot,
  loadWorkspaceModules,
  type MoniiNamespace,
} from "./modules";

type ConsoleOptions = {
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  terminal?: boolean;
};

function installMoniiNamespace(
  context: Record<string, unknown>,
  monii: MoniiNamespace,
): void {
  Object.defineProperty(context, "monii", {
    configurable: false,
    enumerable: true,
    value: monii,
    writable: false,
  });
}

function writeBanner(output: NodeJS.WritableStream, monii: MoniiNamespace): void {
  const operation = getOperationContext();
  const loadedModules = monii.$console.loadedModules.join(", ") || "none";
  const failedModules = Object.entries(monii.$console.loadErrors);

  output.write(
    [
      `Monii TypeScript console (${operation.action_id})`,
      "Input is transpiled without type-checking. Type .help for REPL commands.",
      `Loaded modules: ${loadedModules}`,
      'Private files: await import("./packages/<package>/src/<file>.ts")',
      "",
    ].join("\n"),
  );

  if (failedModules.length > 0) {
    output.write("Modules that could not be loaded:\n");

    for (const [specifier, error] of failedModules) {
      output.write(`- ${specifier}: ${error.message}\n`);
    }

    output.write("Inspect monii.$console.loadErrors for details.\n\n");
  }
}

function waitForExit(replServer: REPLServer): Promise<void> {
  return new Promise((resolve) => {
    replServer.once("exit", resolve);
  });
}

export async function startMoniiConsole({
  input = process.stdin,
  output = process.stdout,
  terminal,
}: ConsoleOptions = {}): Promise<void> {
  const workspaceRoot = await findWorkspaceRoot(process.cwd());
  process.chdir(workspaceRoot);

  const monii = await loadWorkspaceModules(workspaceRoot);
  writeBanner(output, monii);

  const replServer = repl.start({
    input,
    output,
    prompt: "monii> ",
    terminal,
  });
  const initializeContext = (context: Record<string, unknown>) => {
    installMoniiNamespace(context, monii);
  };

  initializeContext(replServer.context);
  replServer.on("reset", initializeContext);

  await waitForExit(replServer);
}
