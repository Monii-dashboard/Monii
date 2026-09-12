import { externalAccountObservations } from "../schema/ingestion";
import { modelFor } from "./model";

export class ExternalAccountObservation extends modelFor(
  externalAccountObservations,
  ["id"] as const,
) {}
