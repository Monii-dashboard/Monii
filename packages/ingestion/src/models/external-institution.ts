import { modelFor } from "@monii/postgres/model";
import { externalInstitutions } from "@monii/postgres/schema/ingestion";

export class ExternalInstitution extends modelFor(
  externalInstitutions,
  ["id"] as const,
) {}
