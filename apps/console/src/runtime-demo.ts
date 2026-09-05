import { getOperationContext } from "@monii/runtime/context";
import { log } from "@monii/runtime/log";

export async function main() {
  log(getOperationContext());
}
