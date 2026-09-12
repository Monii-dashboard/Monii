import { modelFor } from "@monii/postgres/model";
import { synchronizationConnectionResults } from "@monii/postgres/schema/ingestion";

export class SynchronizationConnectionResult extends modelFor(
  synchronizationConnectionResults,
  ["id"] as const,
) {}
