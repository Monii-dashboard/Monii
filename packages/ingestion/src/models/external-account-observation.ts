import { modelFor } from "@monii/postgres/model";
import { externalAccountObservations } from "@monii/postgres/schema/ingestion";

export class ExternalAccountObservation extends modelFor(
  externalAccountObservations,
  ["id"] as const,
) {}
