import type { CSSProperties } from "react";

import type { Institution } from "@/features/wealth/lib/dashboard-model";
import {
  shareOf,
  signalColor,
} from "@/features/wealth/lib/dashboard-model";
import { formatMoney } from "@/features/wealth/lib/format";

import { AccountRow } from "./account-row";
import { SignalBadge } from "./signal-badge";
import styles from "./signal.module.css";

export function InstitutionGroup({
  index,
  institution,
  total,
}: {
  index: number;
  institution: Institution;
  total: number;
}) {
  const share = shareOf(institution.contributedAmount, total);

  return (
    <section
      className="scroll-mt-4 border-b border-border-default max-[680px]:scroll-mt-20"
      id={`institution-${index}`}
      style={{ "--signal": signalColor(index) } as CSSProperties}
    >
      <header
        className={`${styles.wash} grid min-h-24 grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-4 border-b border-border-default px-6 py-4 max-[680px]:grid-cols-[2.25rem_minmax(0,1fr)]`}
      >
        <SignalBadge index={index} />
        <div className="min-w-0">
          <h3 className="mb-1 text-title">{institution.name}</h3>
          <small className="font-mono text-label-small font-medium tracking-label text-content-muted uppercase">
            {institution.accounts.length} account
            {institution.accounts.length === 1 ? "" : "s"} · {share.toFixed(1)}%
            of known wealth
          </small>
        </div>
        <strong className="font-mono text-body font-semibold whitespace-nowrap max-[680px]:col-start-2">
          {formatMoney(institution.contributedAmount)}
        </strong>
      </header>
      <div className="grid grid-cols-2 max-[680px]:grid-cols-1">
        {institution.accounts.map((account) => (
          <AccountRow account={account} key={account.id} total={total} />
        ))}
      </div>
    </section>
  );
}
