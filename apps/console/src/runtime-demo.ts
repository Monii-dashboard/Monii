import { getOperationContext } from "@monii/runtime/context";
import { log } from "@monii/runtime/log";

export async function main() {
log.info("Runtime operation context available", "runtime.context.available", {
  context: getOperationContext(),
});
}
