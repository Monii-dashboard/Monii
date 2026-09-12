import { synchronizationConnectionResults } from "../schema/ingestion";
import { modelFor } from "./model";

export class SynchronizationConnectionResult extends modelFor(
  synchronizationConnectionResults,
  ["id"] as const,
) {}
