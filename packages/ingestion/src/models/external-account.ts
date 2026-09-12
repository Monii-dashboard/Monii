import { modelFor } from "@monii/postgres/model";
import { externalAccounts } from "@monii/postgres/schema/ingestion";

export class ExternalAccount extends modelFor(externalAccounts) {}
