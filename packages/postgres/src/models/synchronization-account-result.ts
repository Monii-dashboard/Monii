import { synchronizationAccountResults } from "../schema/ingestion";
import { modelFor } from "./model";

export class SynchronizationAccountResult extends modelFor(
  synchronizationAccountResults,
  ["id"] as const,
) {}
