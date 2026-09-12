import { modelFor } from "@monii/postgres/model";
import { accountMatchAssessments } from "@monii/postgres/schema/reconciliation";

export class AccountMatchAssessment extends modelFor(accountMatchAssessments) {}
