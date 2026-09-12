import { expect, it } from "@testkit/integration";

import { Account, AccountMerge } from "../models";
import { mergeAccounts } from "./merge-accounts";

it("merges a canonical account group once using stable selection and purpose rules", async () => {
  const older = await Account.create({
    category: "cash",
    createdAt: new Date("2026-09-10T08:00:00.000Z"),
    name: "Older personal account",
    purpose: "personal",
  });
  const newer = await Account.create({
    category: "cash",
    createdAt: new Date("2026-09-11T08:00:00.000Z"),
    name: "Newer business account",
    purpose: "business",
  });

  await expect(
    mergeAccounts({
      accountIds: [newer.id, older.id],
      reason: "confirmed_external_identity",
    }),
  ).resolves.toEqual({
    canonicalAccountId: older.id,
    mergedAccountIds: [newer.id],
    purpose: "business",
  });
  await expect(Account.find(older.id)).resolves.toMatchObject({
    purpose: "business",
  });
  await expect(AccountMerge.find(newer.id)).resolves.toMatchObject({
    canonicalAccountId: older.id,
    reason: "confirmed_external_identity",
  });

  await expect(
    mergeAccounts({
      accountIds: [older.id, newer.id],
      reason: "confirmed_external_identity",
    }),
  ).resolves.toBeNull();
  await expect(AccountMerge.findMany()).resolves.toHaveLength(1);
});
