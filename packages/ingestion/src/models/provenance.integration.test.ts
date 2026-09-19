import {
  Account,
  AccountValuationCandidate,
  Institution,
} from "@monii/accounts/models";
import { expect, it } from "@testkit/integration";

import {
  Connection,
  ExternalAccount,
  ExternalAccountObservation,
  ExternalInstitution,
  ReportedAccountValuation,
  SourceInstance,
  SynchronizationAccountResult,
  SynchronizationConnectionResult,
  SynchronizationRun,
} from ".";

async function expectForeignKeyViolation(
  operation: Promise<unknown>,
  constraintName: string,
) {
  await expect(operation).rejects.toMatchObject({
    cause: { code: "23503", constraint_name: constraintName },
  });
}

async function arrangeSource(name: string) {
  const source = await SourceInstance.create({
    adapterKey: "test",
    name: `Source ${name}`,
    sourceKey: `source-${name}`,
  });
  const institution = await Institution.create({ name: `Institution ${name}` });
  const externalInstitution = await ExternalInstitution.create({
    externalId: `institution-${name}`,
    institutionId: institution.id,
    sourceInstanceId: source.id,
  });
  const connection = await Connection.create({
    externalId: `connection-${name}`,
    externalInstitutionId: externalInstitution.id,
    sourceInstanceId: source.id,
  });
  const account = await Account.create({
    category: "cash",
    institutionId: institution.id,
    managementMode: "external",
    name: `Account ${name}`,
    purpose: "personal",
  });
  const externalAccount = await ExternalAccount.create({
    accountId: account.id,
    connectionId: connection.id,
    externalId: `account-${name}`,
    normalizedTypeSupport: "supported",
    sourceInstanceId: source.id,
  });
  const run = await SynchronizationRun.create({
    actionId: `run-${name}`,
    sourceInstanceId: source.id,
  });
  const observation = await ExternalAccountObservation.create({
    accountId: account.id,
    externalAccountId: externalAccount.id,
    reportedLifecycle: "active",
    sourceInstanceId: source.id,
    synchronizationRunId: run.id,
  });
  const candidate = await AccountValuationCandidate.create({
    accountId: account.id,
    amount: "42.00000000",
    currency: "EUR",
    valuationBasis: "balance",
    valuationMethod: "reported",
  });

  return {
    account,
    candidate,
    connection,
    externalAccount,
    externalInstitution,
    observation,
    run,
    source,
  };
}

it("rejects contradictory source, run, account, and valuation provenance", async () => {
  const first = await arrangeSource("first");
  const second = await arrangeSource("second");
  const identityExternalAccount = await ExternalAccount.create({
    accountId: first.account.id,
    connectionId: first.connection.id,
    externalId: "account-for-identity-mismatch",
    normalizedTypeSupport: "supported",
    sourceInstanceId: first.source.id,
  });

  await expectForeignKeyViolation(
    Connection.create({
      externalId: "crossed-institution",
      externalInstitutionId: second.externalInstitution.id,
      sourceInstanceId: first.source.id,
    }),
    "connections_external_institution_source_fk",
  );
  await expectForeignKeyViolation(
    ExternalAccount.create({
      accountId: first.account.id,
      connectionId: second.connection.id,
      externalId: "crossed-connection",
      normalizedTypeSupport: "supported",
      sourceInstanceId: first.source.id,
    }),
    "external_accounts_connection_source_fk",
  );
  await expectForeignKeyViolation(
    SynchronizationConnectionResult.create({
      connectionId: first.connection.id,
      sourceInstanceId: first.source.id,
      status: "succeeded",
      synchronizationRunId: second.run.id,
    }),
    "sync_connection_results_run_source_fk",
  );
  await expectForeignKeyViolation(
    SynchronizationConnectionResult.create({
      connectionId: second.connection.id,
      sourceInstanceId: first.source.id,
      status: "succeeded",
      synchronizationRunId: first.run.id,
    }),
    "sync_connection_results_connection_source_fk",
  );
  await expectForeignKeyViolation(
    ExternalAccountObservation.create({
      accountId: first.account.id,
      externalAccountId: first.externalAccount.id,
      reportedLifecycle: "active",
      sourceInstanceId: first.source.id,
      synchronizationRunId: second.run.id,
    }),
    "external_account_observations_run_source_fk",
  );
  await expectForeignKeyViolation(
    ExternalAccountObservation.create({
      accountId: second.account.id,
      externalAccountId: second.externalAccount.id,
      reportedLifecycle: "active",
      sourceInstanceId: first.source.id,
      synchronizationRunId: first.run.id,
    }),
    "external_account_observations_account_source_fk",
  );
  await expectForeignKeyViolation(
    ExternalAccountObservation.create({
      accountId: second.account.id,
      externalAccountId: identityExternalAccount.id,
      reportedLifecycle: "active",
      sourceInstanceId: first.source.id,
      synchronizationRunId: first.run.id,
    }),
    "external_account_observations_account_identity_fk",
  );
  await expectForeignKeyViolation(
    SynchronizationAccountResult.create({
      externalAccountId: first.externalAccount.id,
      sourceInstanceId: first.source.id,
      status: "provider_error",
      synchronizationRunId: second.run.id,
    }),
    "sync_account_results_run_source_fk",
  );
  await expectForeignKeyViolation(
    SynchronizationAccountResult.create({
      externalAccountId: second.externalAccount.id,
      sourceInstanceId: first.source.id,
      status: "provider_error",
      synchronizationRunId: first.run.id,
    }),
    "sync_account_results_external_account_source_fk",
  );
  await expectForeignKeyViolation(
    SynchronizationAccountResult.create({
      externalAccountId: first.externalAccount.id,
      externalAccountObservationId: second.observation.id,
      sourceInstanceId: first.source.id,
      status: "succeeded",
      synchronizationRunId: first.run.id,
    }),
    "sync_account_results_observation_provenance_fk",
  );
  await expectForeignKeyViolation(
    ReportedAccountValuation.create({
      accountId: second.account.id,
      externalAccountObservationId: second.observation.id,
      valuationBasis: "balance",
      valuationCandidateId: first.candidate.id,
    }),
    "reported_valuations_candidate_account_fk",
  );
  await expectForeignKeyViolation(
    ReportedAccountValuation.create({
      accountId: first.account.id,
      externalAccountObservationId: first.observation.id,
      valuationBasis: "estimated_value",
      valuationCandidateId: first.candidate.id,
    }),
    "reported_valuations_candidate_basis_fk",
  );
  await expectForeignKeyViolation(
    ReportedAccountValuation.create({
      accountId: second.account.id,
      externalAccountObservationId: first.observation.id,
      valuationBasis: "balance",
      valuationCandidateId: second.candidate.id,
    }),
    "reported_valuations_observation_account_fk",
  );

  await expect(
    ExternalAccount.create({
      accountId: first.account.id,
      connectionId: null,
      externalId: "account-without-connection",
      normalizedTypeSupport: "supported",
      sourceInstanceId: first.source.id,
    }),
  ).resolves.toMatchObject({ connectionId: null });
  await expect(
    SynchronizationAccountResult.create({
      externalAccountId: first.externalAccount.id,
      externalAccountObservationId: null,
      sourceInstanceId: first.source.id,
      status: "provider_error",
      synchronizationRunId: first.run.id,
    }),
  ).resolves.toMatchObject({ externalAccountObservationId: null });
});
