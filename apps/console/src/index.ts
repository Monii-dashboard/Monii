import { runWithOperationContext } from "@monii/runtime/operation";

import { startMoniiConsole } from "./console";

try {
  await runWithOperationContext(
    { surface: "console" },
    () => startMoniiConsole(),
  );
  process.exit(0);
} catch (error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`Monii console failed to start:\n${message}\n`);
  process.exit(1);
}
