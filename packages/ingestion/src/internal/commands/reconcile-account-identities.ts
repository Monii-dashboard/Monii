import type { FinancialOperationalReport } from "../../reporting";
import { loadIdentityAccounts } from "../account-identity/load-identity-accounts";
import { reconcileConfirmedMerges } from "../account-identity/reconcile-confirmed-merges";
import { reconcileMatchAssessments } from "../account-identity/reconcile-match-assessments";

export async function reconcileAccountIdentities(
  runId: string,
): Promise<readonly FinancialOperationalReport[]> {
  const identityAccounts = await loadIdentityAccounts();
  return [
    ...await reconcileMatchAssessments(runId, identityAccounts),
    ...await reconcileConfirmedMerges(runId),
  ];
}
