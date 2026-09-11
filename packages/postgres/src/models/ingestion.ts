import {
  accountIdentityClaims,
  accountMatchAssessments,
  connections,
  externalAccountObservations,
  externalAccounts,
  externalInstitutions,
  reportedAccountValuations,
  sourceInstances,
  synchronizationAccountResults,
  synchronizationConnectionResults,
  synchronizationRuns,
} from "../schema/ingestion";
import { modelFor } from "./model";

export class SourceInstance extends modelFor(sourceInstances, ["id"] as const) {}

export class ExternalInstitution extends modelFor(
  externalInstitutions,
  ["id"] as const,
) {}

export class Connection extends modelFor(connections, ["id"] as const) {}

export class ExternalAccount extends modelFor(externalAccounts, ["id"] as const) {}

export class SynchronizationRun extends modelFor(
  synchronizationRuns,
  ["id"] as const,
) {}

export class SynchronizationConnectionResult extends modelFor(
  synchronizationConnectionResults,
  ["id"] as const,
) {}

export class ExternalAccountObservation extends modelFor(
  externalAccountObservations,
  ["id"] as const,
) {}

export class ReportedAccountValuation extends modelFor(
  reportedAccountValuations,
  ["valuationCandidateId"] as const,
) {}

export class SynchronizationAccountResult extends modelFor(
  synchronizationAccountResults,
  ["id"] as const,
) {}

export class AccountIdentityClaim extends modelFor(
  accountIdentityClaims,
  ["id"] as const,
) {}

export class AccountMatchAssessment extends modelFor(
  accountMatchAssessments,
  ["id"] as const,
) {}
