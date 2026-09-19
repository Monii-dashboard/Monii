import { modelFor } from "@monii/postgres/model";
import { synchronizationAccountResults } from "@monii/postgres/schema/ingestion";

export class SynchronizationAccountResult extends modelFor(
  synchronizationAccountResults,
) {}
