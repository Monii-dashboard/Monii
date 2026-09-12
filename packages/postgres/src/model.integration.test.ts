import { expect, expectTypeOf, it, vi } from "@testkit/integration";

import {
  accounts,
  accountValuationCandidates,
  institutions,
} from "./schema/financial";
import { synchronizationRuns } from "./schema/ingestion";
import {
  accountPolicies,
  snapshotAccountDecisions,
  snapshots,
} from "./schema/wealth";
import { afterCommit, isInTransaction, transaction } from "./transaction";
import { modelFor } from "./model";

class Account extends modelFor(accounts) {
  static archive(id: string, archivedAt = new Date()) {
    return this.update(id, { archivedAt, updatedAt: archivedAt });
  }
}

class AccountPolicy extends modelFor(accountPolicies) {}

class AccountValuationCandidate extends modelFor(accountValuationCandidates) {}

class Institution extends modelFor(institutions) {}

class SnapshotAccountDecision extends modelFor(snapshotAccountDecisions) {}

class SynchronizationRun extends modelFor(synchronizationRuns) {}

class WealthSnapshot extends modelFor(snapshots) {}

it("exposes only create and update writes for a mutable no-delete model", async () => {
  expectTypeOf(Account).toHaveProperty("create");
  expectTypeOf(Account).toHaveProperty("update");
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
  const archivedAt = new Date("2026-09-11T08:00:00.000Z");
  await expect(Account.archive(account.id, archivedAt)).resolves.toMatchObject({
    archivedAt,
  });

  await expect(Account.find(account.id)).resolves.toMatchObject({
    name: "Daily account",
  });
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

it("exposes create but no mutable methods for append-only and lifecycle models", () => {
  expectTypeOf(AccountValuationCandidate).toHaveProperty("create");
  expectTypeOf(AccountValuationCandidate).not.toHaveProperty("update");
  expectTypeOf(AccountValuationCandidate).not.toHaveProperty("delete");
  expectTypeOf(SynchronizationRun).toHaveProperty("create");
  expectTypeOf(SynchronizationRun).not.toHaveProperty("update");
  expectTypeOf(SynchronizationRun).not.toHaveProperty("delete");

  expect("create" in AccountValuationCandidate).toBe(true);
  expect("update" in AccountValuationCandidate).toBe(false);
  expect("delete" in AccountValuationCandidate).toBe(false);
  expect("create" in SynchronizationRun).toBe(true);
  expect("update" in SynchronizationRun).toBe(false);
  expect("delete" in SynchronizationRun).toBe(false);
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
