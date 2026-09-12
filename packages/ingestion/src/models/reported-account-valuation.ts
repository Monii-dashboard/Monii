import { modelFor } from "@monii/postgres/model";
import { reportedAccountValuations } from "@monii/postgres/schema/ingestion";

export class ReportedAccountValuation extends modelFor(
  reportedAccountValuations,
  ["valuationCandidateId"] as const,
) {}
