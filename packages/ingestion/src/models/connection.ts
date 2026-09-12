import { modelFor } from "@monii/postgres/model";
import { connections } from "@monii/postgres/schema/ingestion";

export class Connection extends modelFor(connections) {}
