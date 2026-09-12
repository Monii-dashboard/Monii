import { connections } from "../schema/ingestion";
import { modelFor } from "./model";

export class Connection extends modelFor(connections, ["id"] as const) {}
