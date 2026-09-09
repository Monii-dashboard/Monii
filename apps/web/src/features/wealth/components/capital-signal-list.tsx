import type { CSSProperties } from "react";

import type { Wealth } from "@/features/wealth/lib/dashboard-model";
import {
  contributionTotal,
  shareOf,
  signalColor,
} from "@/features/wealth/lib/dashboard-model";
import { formatMoney } from "@/features/wealth/lib/format";

import { SignalBadge } from "./signal-badge";

export function CapitalSignalList({ wealth }: { wealth: Wealth }) {
  const total = contributionTotal(wealth);

  return (
    <div className="flex flex-col p-8 max-[950px]:min-h-102.5 max-[680px]:min-h-115 max-[680px]:p-6">
      <header className="flex justify-between gap-4 border-b border-border-default pb-6">
        <span className="font-mono text-label font-semibold tracking-label-wide uppercase">
          Capital signal
        </span>
        <small className="font-mono text-label-small font-medium tracking-label text-content-muted uppercase">
          Contribution to known wealth
        </small>
      </header>
      <div className="flex flex-1 flex-col justify-center">
        {wealth.institutions.map((institution, index) => {
          const share = shareOf(institution.contributedAmount, total);

          return (
            <a
              className="grid min-h-18 grid-cols-[2.25rem_minmax(0,1fr)_3.75rem_auto] items-center gap-4 border-b border-border-subtle py-4 text-inherit no-underline transition-[padding,background] duration-200 hover:bg-surface-faint hover:px-2.5 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-accent max-[680px]:grid-cols-[2.25rem_minmax(0,1fr)_auto]"
              href={`#institution-${index}`}
              key={institution.id ?? index}
              style={{ "--signal": signalColor(index) } as CSSProperties}
            >
              <SignalBadge index={index} />
              <div className="flex min-w-0 flex-col gap-2">
                <strong className="overflow-hidden text-body text-ellipsis whitespace-nowrap">
                  {institution.name}
                </strong>
                <i className="block h-[3px] bg-track">
                  <b
                    className="block h-full origin-left animate-data-progress [background:var(--theme-effect-data-gradient)] [box-shadow:0_0_9px_var(--theme-color-chart-2)]"
                    style={{ width: `${share}%` }}
                  />
                </i>
              </div>
              <em className="font-mono text-label font-medium text-content-muted not-italic">
                {share.toFixed(1)}%
              </em>
              <strong className="font-mono text-body-small font-semibold whitespace-nowrap max-[680px]:col-start-2">
                {formatMoney(institution.contributedAmount)}
              </strong>
            </a>
          );
        })}
      </div>
    </div>
  );
}
