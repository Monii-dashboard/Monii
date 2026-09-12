import { reportedAccountValuations } from "../schema/ingestion";
import { modelFor } from "./model";

export class ReportedAccountValuation extends modelFor(
  reportedAccountValuations,
  ["valuationCandidateId"] as const,
) {}
