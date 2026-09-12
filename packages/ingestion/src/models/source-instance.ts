import { modelFor } from "@monii/postgres/model";
import { sourceInstances } from "@monii/postgres/schema/ingestion";

export class SourceInstance extends modelFor(sourceInstances, ["id"] as const) {}
