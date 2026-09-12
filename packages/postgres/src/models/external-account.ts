import { externalAccounts } from "../schema/ingestion";
import { modelFor } from "./model";

export class ExternalAccount extends modelFor(externalAccounts, ["id"] as const) {}
