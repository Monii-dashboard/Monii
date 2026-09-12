import { accountMatchAssessments } from "../schema/ingestion";
import { modelFor } from "./model";

export class AccountMatchAssessment extends modelFor(
  accountMatchAssessments,
  ["id"] as const,
) {}
