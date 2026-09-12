import { afterCommit } from "@monii/postgres/transaction";

import type {
  FinancialOperationalReport,
  SynchronizationReporter,
} from "../reporting";

export function reportAfterCommit(
  reporter: SynchronizationReporter | undefined,
  reports: readonly FinancialOperationalReport[],
): void {
  afterCommit(() => {
    for (const report of reports) reporter?.report(report);
  });
}
