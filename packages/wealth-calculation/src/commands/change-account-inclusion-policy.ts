import { randomUUID } from "node:crypto";

import { Account } from "@monii/accounts/models";
import { afterCommit, transaction } from "@monii/postgres/transaction";

import type { AccountInclusionPolicy } from "../account-policy";
import { AccountPolicy } from "../models";
import type { WealthOperationalReport, WealthReporter } from "../reporting";
import { createWealthSnapshot } from "./create-wealth-snapshot";

export type ChangeAccountInclusionPolicyInput = Readonly<{
  accountId: string;
  actionId: string;
  inclusionPolicy: AccountInclusionPolicy;
}>;

export async function changeAccountInclusionPolicy(
  input: ChangeAccountInclusionPolicyInput,
  reporter?: WealthReporter,
): Promise<boolean> {
  return transaction(async () => {
    const account = await Account.find(input.accountId);
    if (!account || account.archivedAt) {
      const report: WealthOperationalReport = {
        event: "wealth.account_policy.rejected",
        fields: {
          account_id: input.accountId,
          requested_inclusion_policy: input.inclusionPolicy,
          reason: "account_missing_or_archived",
        },
        level: "warn",
        message: "Account inclusion policy change was rejected",
      };
      afterCommit(() => reporter?.report(report));
      return false;
    }

    const policy = await AccountPolicy.find(input.accountId);
    if (policy) {
      await AccountPolicy.update(input.accountId, {
        inclusionPolicy: input.inclusionPolicy,
        updatedAt: new Date(),
      });
    } else {
      await AccountPolicy.create({
        accountId: input.accountId,
        inclusionPolicy: input.inclusionPolicy,
      });
    }

    const snapshotId = await createWealthSnapshot(
      {
        actionId: input.actionId,
        causationId: randomUUID(),
        reason: "account_policy_changed",
      },
      reporter,
    );
    const report: WealthOperationalReport = {
      event: "wealth.account_policy.changed",
      fields: {
        account_id: input.accountId,
        inclusion_policy: input.inclusionPolicy,
        snapshot_id: snapshotId,
      },
      level: "info",
      message: "Account inclusion policy changed",
    };
    afterCommit(() => reporter?.report(report));
    return true;
  });
}
