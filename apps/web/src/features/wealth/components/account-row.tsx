import type { Account } from "@/features/wealth/lib/dashboard-model";
import {
  accountValue,
  shareOf,
} from "@/features/wealth/lib/dashboard-model";
import {
  formatAccountKind,
  formatDecision,
} from "@/features/wealth/lib/format";

import { CashIcon, InvestmentIcon } from "./icons";
import styles from "./signal.module.css";

export function AccountRow({
  account,
  total,
}: {
  account: Account;
  total: number;
}) {
  const Icon = account.category === "investment" ? InvestmentIcon : CashIcon;
  const included = account.decision === "included";
  const share = shareOf(account.contributedAmount, total);
  const needsAttention =
    account.health === "stale" ||
    account.health === "synchronization_failed" ||
    account.identityConflict;

  return (
    <article className="grid min-h-30 grid-cols-[2.75rem_minmax(0,1fr)_auto] grid-rows-[auto_auto] items-center gap-x-3 gap-y-2 border-r border-b border-border-default p-6 transition-colors duration-200 hover:bg-surface-faint max-[680px]:grid-rows-[auto_auto_auto] max-[680px]:border-r-0">
      <span
        className={`${styles.glyph} row-span-full grid size-9 place-items-center rounded-[0.625rem] border text-[var(--signal)] max-[680px]:col-start-1 max-[680px]:row-start-1 max-[680px]:row-end-3`}
      >
        <Icon className="size-4" />
      </span>
      <div className="flex min-w-0 flex-col gap-1 max-[680px]:col-start-2 max-[680px]:col-end-4 max-[680px]:row-start-1">
        <strong className="overflow-hidden text-body text-ellipsis whitespace-nowrap">
          {account.name}
        </strong>
        <small className="font-mono text-label-small font-medium tracking-label text-content-muted uppercase">
          {formatAccountKind(account.category)} · {formatDecision(account.decision)}
          {needsAttention ? " · check data" : ""}
        </small>
      </div>
      <span className="text-right font-mono text-label-small font-medium tracking-label text-content-muted uppercase max-[680px]:col-start-3 max-[680px]:row-start-2">
        {included ? "Contributing" : "Not in total"}
      </span>
      <strong className="font-mono text-body-small font-semibold whitespace-nowrap max-[680px]:col-start-2 max-[680px]:row-start-2">
        {accountValue(account)}
      </strong>
      <div className="col-start-2 col-end-4 grid grid-cols-[3rem_1fr] items-center gap-3 max-[680px]:row-start-3">
        <span className="font-mono text-label-small font-medium text-content-muted">
          {included ? `${share.toFixed(1)}%` : "—"}
        </span>
        <i className="block h-[3px] bg-track">
          <b
            className={`${styles.progress} block h-full origin-left animate-data-progress`}
            style={{ width: `${included ? Math.max(2, share) : 0}%` }}
          />
        </i>
      </div>
    </article>
  );
}
