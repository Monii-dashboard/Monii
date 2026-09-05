import { Errors, run, settings, ux } from "@oclif/core";
import { log } from "@monii/runtime/log";
import { runWithOperationContext } from "@monii/runtime/operation";

// The process entrypoint already registers tsx, including in production.
settings.enableAutoTranspile = false;

export async function runCli(argv: string[]): Promise<number> {
  return runWithOperationContext({ surface: "cli" }, async () => {
    try {
      const args = argv[0] === "--" ? argv.slice(1) : argv;
      const result = await run(args, import.meta.url);
      return typeof result === "number" ? result : 0;
    } catch (error) {
      if (error instanceof Errors.CLIError) {
        if (!(error instanceof Errors.ExitError)) {
          ux.stderr(error.message);
        }
        return error.oclif.exit ?? 1;
      }

      log.error("Synchronization command crashed", "sync.crashed", {
        error_kind: error instanceof Error ? error.name : "unexpected",
        error_code: "unhandled",
      });
      return 1;
    }
  });
}
