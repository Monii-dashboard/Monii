import { sourceInstances } from "../schema/ingestion";
import { modelFor } from "./model";

export class SourceInstance extends modelFor(sourceInstances, ["id"] as const) {}
