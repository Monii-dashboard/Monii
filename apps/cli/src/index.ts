import { log } from "@monii/runtime/log";
import { runWithOperationContext } from "@monii/runtime/operation";

const command = process.argv.slice(2).find((argument) => argument !== "--");

if (command === "sync") {
  runWithOperationContext(
    { surface: "cli" },
    () =>
      log("Daily synchronization started", "sync.started", {
        dummy: true,
      }),
  );
}
