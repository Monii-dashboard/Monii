import { externalInstitutions } from "../schema/ingestion";
import { modelFor } from "./model";

export class ExternalInstitution extends modelFor(
  externalInstitutions,
  ["id"] as const,
) {}
