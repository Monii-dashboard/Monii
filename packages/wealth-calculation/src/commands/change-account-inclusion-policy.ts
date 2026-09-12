import { randomUUID } from "node:crypto";

import { getDatabase } from "@monii/postgres/client";
import { accountPolicies, accounts } from "@monii/postgres/schema";
import { afterCommit, transaction } from "@monii/postgres/transaction";
import { and, eq, sql } from "drizzle-orm";

import type { AccountInclusionPolicy } from "../account-policy";
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
    const updated = await getDatabase()
      .update(accountPolicies)
      .set({ inclusionPolicy: input.inclusionPolicy, updatedAt: new Date() })
      .where(
        and(
          eq(accountPolicies.accountId, input.accountId),
          sql`exists (select 1 from ${accounts} where ${accounts.id} = ${input.accountId} and ${accounts.archivedAt} is null)`,
        ),
      )
      .returning({ accountId: accountPolicies.accountId });
    if (!updated.length) {
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
