import { transaction } from "@monii/postgres/transaction";

import { createCanonicalAccountIdResolver } from "../account-merge";
import { Account, AccountMerge } from "../models";

export type MergeAccountsInput = Readonly<{
  accountIds: readonly string[];
  reason: "confirmed_external_identity";
}>;

export type MergeAccountsOutcome = Readonly<{
  canonicalAccountId: string;
  mergedAccountIds: readonly string[];
  purpose: "business" | "personal" | "unknown";
}>;

export async function mergeAccounts(
  input: MergeAccountsInput,
): Promise<MergeAccountsOutcome | null> {
  return transaction(async () => {
    const existingMerges = await AccountMerge.findMany();
    const resolveCanonicalAccountId = createCanonicalAccountIdResolver(
      existingMerges,
    );
    const accountIds = [
      ...new Set(
        input.accountIds.map((id) => resolveCanonicalAccountId(id)),
      ),
    ];
    const accounts = (await Promise.all(accountIds.map((id) => Account.find(id))))
      .filter((account) => account !== null)
      .sort(
        (left, right) =>
          left.createdAt.getTime() - right.createdAt.getTime() ||
          left.id.localeCompare(right.id),
      );
    if (accounts.length !== accountIds.length) {
      throw new Error("Cannot merge an account that does not exist");
    }
    const canonical = accounts[0];
    if (!canonical || accounts.length < 2) return null;

    const mergedAccountIds = accounts.slice(1).map(({ id }) => id);
    const purpose = accounts.some((account) => account.purpose === "business")
      ? "business"
      : accounts.some((account) => account.purpose === "personal")
        ? "personal"
        : "unknown";
    await Account.update(canonical.id, { purpose, updatedAt: new Date() });
    for (const mergedAccountId of mergedAccountIds) {
      await AccountMerge.create({
        canonicalAccountId: canonical.id,
        mergedAccountId,
        reason: input.reason,
      });
    }

    return {
      canonicalAccountId: canonical.id,
      mergedAccountIds,
      purpose,
    };
  });
}
