import { expect, expectTypeOf, it, vi } from "@testkit/integration";

import { afterCommit, isInTransaction, transaction } from "../transaction";
import { Account } from "./account";
import { AccountPolicy } from "./account-policy";
import { Institution } from "./institution";
import { SourceInstance } from "./source-instance";
import { SynchronizationRun } from "./synchronization-run";

it("inherits create, find, findMany, update, and delete for an id model", async () => {
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
  await expect(Account.findMany({ institutionId: institution.id })).resolves
    .toHaveLength(1);
  await expect(Account.find(undefined as never)).rejects.toThrow(
    "Model primary key id is required",
  );

  const updated = await Account.update(account.id, { name: "Daily account" });
  expect(updated).toMatchObject({ name: "Daily account" });
  const archivedAt = new Date("2026-09-11T08:00:00.000Z");
  await expect(Account.archive(account.id, archivedAt)).resolves.toMatchObject({
    archivedAt,
  });

  await expect(Account.delete(account.id)).resolves.toBe(true);
  await expect(Account.find(account.id)).resolves.toBeNull();
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
  await expect(AccountPolicy.delete(account.id)).resolves.toBe(true);
});

it("loads typed named queries from the model that owns the table", async () => {
  const source = await SourceInstance.create({
    adapterKey: "test",
    name: "Typed query source",
    sourceKey: "typed-query-source",
  });
  const successfulFinishedAt = new Date("2026-09-10T08:30:00.000Z");
  await SynchronizationRun.create({
    actionId: "older-success",
    finishedAt: successfulFinishedAt,
    sourceInstanceId: source.id,
    startedAt: new Date("2026-09-10T08:00:00.000Z"),
    status: "succeeded",
  });
  await SynchronizationRun.create({
    actionId: "newer-failure",
    finishedAt: new Date("2026-09-11T08:30:00.000Z"),
    sourceInstanceId: source.id,
    startedAt: new Date("2026-09-11T08:00:00.000Z"),
    status: "failed",
  });

  const latestStatus = await SynchronizationRun.query(
    "latest_status",
  ).loadOne();
  const lastSuccessfulCompletion = await SynchronizationRun.query(
    "last_successful_completion",
  ).loadOne();

  expectTypeOf(latestStatus).toEqualTypeOf<{ status: string } | null>();
  expectTypeOf(lastSuccessfulCompletion).toEqualTypeOf<{
    finishedAt: Date | null;
  } | null>();
  expect(latestStatus).toEqual({ status: "failed" });
  expect(lastSuccessfulCompletion).toEqual({
    finishedAt: successfulFinishedAt,
  });
  await expect(
    SynchronizationRun.query("latest_status").load(),
  ).resolves.toEqual([{ status: "failed" }]);
  await expect(
    SynchronizationRun.query("latest_status").count(),
  ).resolves.toBe(1);

  if (false) {
    // @ts-expect-error Query names are restricted to the model's registry.
    SynchronizationRun.query("unknown_query");
    // @ts-expect-error Each query name exposes only its selected result fields.
    void latestStatus?.finishedAt;
  }
});

it("rolls back model calls through the active async transaction", async () => {
  const committed = vi.fn();
  let accountId = "";

  await expect(transaction(async () => {
    expect(isInTransaction()).toBe(true);
    accountId = (await Account.create({
      category: "cash",
      name: "Rolled back",
      purpose: "personal",
    })).id;
    afterCommit(committed);
    throw new Error("rollback");
  })).rejects.toThrow("rollback");

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
