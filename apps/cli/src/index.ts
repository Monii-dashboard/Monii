import { randomUUID } from "node:crypto";

import { log } from "@monii/runtime/log";
import { runWithOperationContext } from "@monii/runtime/operation";

const command = process.argv.slice(2).find((argument) => argument !== "--");

if (command === "sync") {
  runWithOperationContext(
    { action_id: randomUUID(), surface: "cli" },
    () =>
      log("sync.started", {
        message: "Daily synchronization started",
        dummy: true,
      }),
  );
}
