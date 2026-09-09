import type { ReactNode } from "react";

import type { Wealth } from "@/features/wealth/lib/dashboard-model";
import { formatMoney } from "@/features/wealth/lib/format";

const noticeClassName = {
  danger:
    "flex min-h-14 items-center gap-4 rounded-control border border-danger-outline bg-danger-subtle px-6 py-3 text-danger-content-strong max-[680px]:flex-col max-[680px]:items-start max-[680px]:gap-2",
  info: "flex min-h-14 items-center gap-4 rounded-control border border-info-outline bg-info-subtle px-6 py-3 text-info-content max-[680px]:flex-col max-[680px]:items-start max-[680px]:gap-2",
};

function Notice({
  children,
  label,
  tone,
}: {
  children: ReactNode;
  label: string;
  tone: keyof typeof noticeClassName;
}) {
  return (
    <div className={noticeClassName[tone]}>
      <span className="whitespace-nowrap font-mono text-label-small font-semibold tracking-label-wide uppercase">
        {label}
      </span>
      <p className="m-0 text-body-small leading-5 opacity-75">{children}</p>
    </div>
  );
}

export function DataNotices({ wealth }: { wealth: Wealth }) {
  const hasPossibleOverlap = wealth.likelyDuplicateGroupCount > 0;
  if (wealth.isComplete && !hasPossibleOverlap) return null;

  return (
    <aside aria-label="Data notes" className="mt-4 grid gap-3">
      {!wealth.isComplete ? (
        <Notice label="Completeness" tone="danger">
          The total is incomplete. Accounts without a usable value remain
          visible, and unknown values are never counted as zero.
        </Notice>
      ) : null}
      {hasPossibleOverlap ? (
        <Notice label="Possible overlap" tone="info">
          Adjusted estimate {formatMoney(wealth.duplicateAdjustedEstimateAmount)} ·
          possible range {formatMoney(wealth.possibleTotalMinimum)}–
          {formatMoney(wealth.possibleTotalMaximum)}.
        </Notice>
      ) : null}
    </aside>
  );
}
