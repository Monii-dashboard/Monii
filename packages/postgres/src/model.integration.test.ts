import { expect, expectTypeOf, it, vi } from "@testkit/integration";
import { asc, sql } from "drizzle-orm";

import {
  accounts,
  accountValuationCandidates,
  institutions,
} from "./schema/financial";
import {
  externalAccounts,
  sourceInstances,
  synchronizationRuns,
} from "./schema/ingestion";
import {
  accountPolicies,
  snapshotAccountDecisions,
  snapshots,
} from "./schema/wealth";
import { afterCommit, isInTransaction, transaction } from "./transaction";
import { getDatabase } from "./client";
import { defineModelQuery, modelFor } from "./model";

class Account extends modelFor(accounts) {
  static archive(id: string, archivedAt = new Date()) {
    return this.update(id, { archivedAt, updatedAt: archivedAt });
  }
}

class AccountPolicy extends modelFor(accountPolicies) {}

class AccountValuationCandidate extends modelFor(accountValuationCandidates) {}

class Institution extends modelFor(institutions) {}

class SnapshotAccountDecision extends modelFor(snapshotAccountDecisions) {}

class ExternalAccount extends modelFor(externalAccounts) {}

class SourceInstance extends modelFor(sourceInstances) {}

class SynchronizationRun extends modelFor(synchronizationRuns) {}

class WealthSnapshot extends modelFor(snapshots) {}

const accountQueries = {
  all_ids: defineModelQuery(() =>
    getDatabase()
      .select({ id: accounts.id })
      .from(accounts)
      .orderBy(asc(accounts.id)),
  ),
  invalid_projection: defineModelQuery(() =>
    getDatabase()
      .select({ value: sql<number>`${accounts.name}::integer`.as("value") })
      .from(accounts),
  ),
};

class QueriedAccount extends modelFor(accounts, accountQueries) {}

it("exposes only create and update writes for a mutable no-delete model", async () => {
  expectTypeOf(Account).toHaveProperty("create");
  expectTypeOf(Account).toHaveProperty("update");
  expectTypeOf(Account.update).parameter(1).not.toHaveProperty("createdAt");
  expectTypeOf(Account.update).parameter(1).not.toHaveProperty("id");
  expectTypeOf(Account).not.toHaveProperty("delete");
  expect("create" in Account).toBe(true);
  expect("update" in Account).toBe(true);
  expect("delete" in Account).toBe(false);

  const institution = await Institution.create({ name: "Northbank" });
  const account = await Account.create({
    category: "cash",
    institutionId: institution.id,
    name: "Everyday",
    purpose: "personal",
  });

  const found = await Account.find(account.id);
  expect(found).toBeInstanceOf(Account);
  expect(found?.toJSON()).toMatchObject({
    id: account.id,
    institutionId: institution.id,
    name: "Everyday",
  });
  await expect(
    Account.findMany({ institutionId: institution.id }),
  ).resolves.toHaveLength(1);
  await expect(Account.find(undefined as never)).rejects.toThrow(
    "Model primary key id is required",
  );

  const updated = await Account.update(account.id, { name: "Daily account" });
  expect(updated).toMatchObject({ name: "Daily account" });
  await expect(
    Account.update(account.id, { createdAt: new Date() } as never),
  ).rejects.toThrow("Model field createdAt is immutable");
  const archivedAt = new Date("2026-09-11T08:00:00.000Z");
  await expect(Account.archive(account.id, archivedAt)).resolves.toMatchObject({
    archivedAt,
  });

  await expect(Account.find(account.id)).resolves.toMatchObject({
    name: "Daily account",
  });
});

it("returns runtime-immutable model record snapshots", async () => {
  const account = await Account.create({
    category: "cash",
    name: "Immutable account",
    purpose: "personal",
  });
  const originalCreatedAt = account.createdAt.getTime();

  expect(Object.isFrozen(account)).toBe(true);
  expect(() => {
    (account as { name: string | null }).name = "Changed locally";
  }).toThrow(TypeError);

  account.createdAt.setTime(0);
  expect(account.createdAt.getTime()).toBe(originalCreatedAt);

  const json = account.toJSON();
  json.createdAt.setTime(0);
  expect(account.toJSON().createdAt.getTime()).toBe(originalCreatedAt);
});

it("rejects undefined findMany filters instead of widening the query", async () => {
  await Account.create({
    category: "cash",
    name: "Existing account",
    purpose: "personal",
  });

  await expect(
    Account.findMany({ id: undefined } as never),
  ).rejects.toThrow("Model field id cannot be undefined");
});

it("reserves an argument-free findMany call for intentionally unfiltered reads", async () => {
  await Account.create({ category: "cash", purpose: "personal" });

  await expect(Account.findMany()).resolves.toHaveLength(1);
  await expect(Account.findMany({} as never)).rejects.toThrow(
    "Model filters must include at least one field; call findMany() to load all rows",
  );
  await expect(Account.findMany(undefined as never)).rejects.toThrow(
    "Model filters must include at least one field; call findMany() to load all rows",
  );
});

it("rejects loadOne when a named query returns multiple rows", async () => {
  await Account.create({
    category: "cash",
    name: "First account",
    purpose: "personal",
  });
  await Account.create({
    category: "cash",
    name: "Second account",
    purpose: "personal",
  });

  await expect(QueriedAccount.query("all_ids").loadOne()).rejects.toThrow(
    "Model query all_ids expected at most one row but returned multiple rows",
  );
});

it("counts a named query in PostgreSQL without loading its projection", async () => {
  await Account.create({
    category: "cash",
    name: "not-a-number",
    purpose: "personal",
  });

  await expect(
    QueriedAccount.query("invalid_projection").count(),
  ).resolves.toBe(1);
});

it("uses a configured non-id primary key without redefining inherited methods", async () => {
  const account = await Account.create({
    category: "cash",
    name: "Policy account",
    purpose: "personal",
  });
  await AccountPolicy.create({ accountId: account.id });

  await expect(AccountPolicy.find(account.id)).resolves.toMatchObject({
    accountId: account.id,
    inclusionPolicy: "automatic",
  });
  await expect(
    AccountPolicy.update(account.id, { inclusionPolicy: "exclude" }),
  ).resolves.toMatchObject({ inclusionPolicy: "exclude" });
});

it("derives update availability directly from each table write policy", async () => {
  expectTypeOf(AccountValuationCandidate).toHaveProperty("create");
  expectTypeOf(AccountValuationCandidate).not.toHaveProperty("update");
  expectTypeOf(AccountValuationCandidate).not.toHaveProperty("delete");
  expectTypeOf(SynchronizationRun).toHaveProperty("create");
  expectTypeOf(SynchronizationRun).toHaveProperty("findForUpdate");
  expectTypeOf(SynchronizationRun).toHaveProperty("update");
  expectTypeOf(SynchronizationRun).toHaveProperty("updateIf");
  expectTypeOf(SynchronizationRun.updateIf)
    .parameter(1)
    .not.toHaveProperty("id");
  expectTypeOf(SynchronizationRun.update)
    .parameter(1)
    .not.toHaveProperty("sourceInstanceId");
  expectTypeOf(SynchronizationRun.update)
    .parameter(1)
    .not.toHaveProperty("actionId");
  expectTypeOf(SynchronizationRun.update)
    .parameter(1)
    .not.toHaveProperty("startedAt");
  expectTypeOf(SynchronizationRun).not.toHaveProperty("delete");

  expect("create" in AccountValuationCandidate).toBe(true);
  expect("update" in AccountValuationCandidate).toBe(false);
  expect("delete" in AccountValuationCandidate).toBe(false);
  expect("create" in SynchronizationRun).toBe(true);
  expect("findForUpdate" in SynchronizationRun).toBe(true);
  expect("update" in SynchronizationRun).toBe(true);
  expect("updateIf" in SynchronizationRun).toBe(true);
  expect("delete" in SynchronizationRun).toBe(false);

  const source = await SourceInstance.create({
    adapterKey: "model-test",
    name: "Model test source",
    sourceKey: "model-test-source",
  });
  const run = await SynchronizationRun.create({
    actionId: "model-test-run",
    sourceInstanceId: source.id,
  });
  const finishedAt = new Date("2026-09-12T10:00:00.000Z");

  await expect(
    SynchronizationRun.update(run.id, {
      finishedAt,
      status: "succeeded",
    }),
  ).resolves.toMatchObject({ finishedAt, status: "succeeded" });
  await expect(
    SynchronizationRun.update(run.id, { actionId: "changed" } as never),
  ).rejects.toThrow("Model field actionId is immutable");
});

it("updates a record only when its expected state still matches", async () => {
  const source = await SourceInstance.create({
    adapterKey: "conditional-model-test",
    name: "Conditional model test source",
    sourceKey: "conditional-model-test-source",
  });
  const run = await SynchronizationRun.create({
    actionId: "conditional-model-test-run",
    sourceInstanceId: source.id,
  });
  const finishedAt = new Date("2026-09-12T11:00:00.000Z");

  await expect(
    SynchronizationRun.updateIf(
      run.id,
      { status: "running" },
      { finishedAt, status: "succeeded" },
    ),
  ).resolves.toMatchObject({ finishedAt, status: "succeeded" });
  await expect(
    SynchronizationRun.updateIf(
      run.id,
      { status: "running" },
      {
        errorCode: "late_failure",
        errorKind: "orchestration",
        finishedAt: new Date(),
        status: "failed",
      },
    ),
  ).resolves.toBeNull();
  await expect(SynchronizationRun.find(run.id)).resolves.toMatchObject({
    errorCode: null,
    status: "succeeded",
  });
  await expect(
    SynchronizationRun.updateIf(run.id, {} as never, { status: "failed" }),
  ).rejects.toThrow("Model update conditions must include at least one field");
  await expect(
    SynchronizationRun.updateIf(
      run.id,
      { status: "succeeded" },
      { actionId: "changed" } as never,
    ),
  ).rejects.toThrow("Model field actionId is immutable");
});

it("requires a transaction for locking model records", async () => {
  const source = await SourceInstance.create({
    adapterKey: "locking-model-test",
    name: "Locking model test source",
    sourceKey: "locking-model-test-source",
  });
  const run = await SynchronizationRun.create({
    actionId: "locking-model-test-run",
    sourceInstanceId: source.id,
  });

  await expect(SynchronizationRun.findForUpdate(run.id)).rejects.toThrow(
    "Model.findForUpdate requires transaction()",
  );
  await expect(
    transaction(() => SynchronizationRun.findForUpdate(run.id)),
  ).resolves.toMatchObject({ id: run.id, status: "running" });
});

it("holds a model update lock until its transaction finishes", async () => {
  const source = await SourceInstance.create({
    adapterKey: "held-lock-model-test",
    name: "Held lock model test source",
    sourceKey: "held-lock-model-test-source",
  });
  const run = await SynchronizationRun.create({
    actionId: "held-lock-model-test-run",
    sourceInstanceId: source.id,
  });
  let announceLocked!: () => void;
  let releaseLock!: () => void;
  const locked = new Promise<void>((resolve) => {
    announceLocked = resolve;
  });
  const release = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  const lockOwner = transaction(async () => {
    await SynchronizationRun.findForUpdate(run.id);
    announceLocked();
    await release;
  });

  await locked;
  try {
    await expect(
      transaction(async () => {
        await getDatabase().execute(sql`set local lock_timeout = '50ms'`);
        await SynchronizationRun.update(run.id, { status: "running" });
      }),
    ).rejects.toMatchObject({ cause: { code: "55P03" } });
  } finally {
    releaseLock();
    await lockOwner;
  }
});

it("excludes stable external-account identity from model updates", async () => {
  expectTypeOf(ExternalAccount.update).parameter(1).not.toHaveProperty(
    "accountId",
  );
  expectTypeOf(ExternalAccount.update).parameter(1).not.toHaveProperty(
    "sourceInstanceId",
  );
  expectTypeOf(ExternalAccount.update).parameter(1).not.toHaveProperty(
    "externalId",
  );
  expectTypeOf(ExternalAccount.update).parameter(1).toHaveProperty(
    "reportedName",
  );

  await expect(
    ExternalAccount.update("00000000-0000-0000-0000-000000000001", {
      accountId: "00000000-0000-0000-0000-000000000002",
    } as never),
  ).rejects.toThrow("Model field accountId is immutable");
});

it("requires every composite primary-key field when finding one record", async () => {
  expectTypeOf(SnapshotAccountDecision.find).parameter(0).toEqualTypeOf<{
    accountId: string;
    snapshotId: string;
  }>();

  const account = await Account.create({
    category: "cash",
    purpose: "personal",
  });
  const snapshot = await WealthSnapshot.create({
    actionId: "composite-model-key",
    causationId: "00000000-0000-0000-0000-000000000001",
    contributingAccountCount: 0,
    duplicateAdjustedEstimateAmount: "0",
    headlineAmount: "0",
    isComplete: false,
    missingAccountCount: 1,
    reason: "account_policy_changed",
  });
  await SnapshotAccountDecision.create({
    accountCategory: "cash",
    accountId: account.id,
    accountManagementMode: "external",
    accountPurpose: "personal",
    decision: "missing_selected_valuation",
    inclusionPolicy: "automatic",
    selectedValuationMethod: "reported",
    snapshotId: snapshot.id,
  });

  await expect(
    SnapshotAccountDecision.find({
      accountId: account.id,
      snapshotId: snapshot.id,
    }),
  ).resolves.toMatchObject({ accountId: account.id, snapshotId: snapshot.id });
  await expect(
    SnapshotAccountDecision.findMany({ snapshotId: snapshot.id }),
  ).resolves.toHaveLength(1);
  await expect(
    SnapshotAccountDecision.find({ snapshotId: "missing" } as never),
  ).rejects.toThrow("Model primary key accountId is required");
});

it("rolls back model calls through the active async transaction", async () => {
  const committed = vi.fn();
  let accountId = "";

  await expect(
    transaction(async () => {
      expect(isInTransaction()).toBe(true);
      accountId = (
        await Account.create({
          category: "cash",
          name: "Rolled back",
          purpose: "personal",
        })
      ).id;
      afterCommit(committed);
      throw new Error("rollback");
    }),
  ).rejects.toThrow("rollback");

  expect(isInTransaction()).toBe(false);
  expect(committed).not.toHaveBeenCalled();
  await expect(Account.find(accountId)).resolves.toBeNull();
});

it("uses savepoints for nested transactions and runs only committed callbacks", async () => {
  const outerCommitted = vi.fn();
  const innerRolledBack = vi.fn();

  const keptAccountId = await transaction(async () => {
    try {
      await transaction(async () => {
        await Account.create({
          category: "cash",
          name: "Savepoint rollback",
          purpose: "personal",
        });
        afterCommit(innerRolledBack);
        throw new Error("nested rollback");
      });
    } catch (error) {
      expect(error).toEqual(new Error("nested rollback"));
    }

    const kept = await Account.create({
      category: "cash",
      name: "Committed",
      purpose: "personal",
    });
    afterCommit(outerCommitted);
    return kept.id;
  });

  expect(outerCommitted).toHaveBeenCalledOnce();
  expect(innerRolledBack).not.toHaveBeenCalled();
  await expect(Account.findMany()).resolves.toHaveLength(1);
  await expect(Account.find(keptAccountId)).resolves.toMatchObject({
    name: "Committed",
  });
});

it("preserves a committed result when an after-commit effect fails", async () => {
  const observedFailure = vi.fn();
  const laterEffect = vi.fn();

  const accountId = await transaction(async () => {
    const account = await Account.create({
      category: "cash",
      name: "Committed before reporting",
      purpose: "personal",
    });
    afterCommit(
      () => {
        throw new Error("reporting unavailable");
      },
      { onFailure: observedFailure },
    );
    afterCommit(laterEffect);
    return account.id;
  });

  expect(observedFailure).toHaveBeenCalledWith(
    new Error("reporting unavailable"),
  );
  expect(laterEffect).toHaveBeenCalledOnce();
  await expect(Account.find(accountId)).resolves.toMatchObject({
    name: "Committed before reporting",
  });
});

it("supports read-only repeatable-read transactions", async () => {
  await transaction(async () => {
    const [settings] = await getDatabase().execute<{
      accessMode: string;
      isolationLevel: string;
    }>(sql`
      select
        current_setting('transaction_read_only') as "accessMode",
        current_setting('transaction_isolation') as "isolationLevel"
    `);
    expect(settings).toEqual({
      accessMode: "on",
      isolationLevel: "repeatable read",
    });
  }, {
    accessMode: "read only",
    isolationLevel: "repeatable read",
  });
});
