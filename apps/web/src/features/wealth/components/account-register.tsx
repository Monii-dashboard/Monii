import { MoniiMark } from "@/components/app-shell/monii-mark";
import {
  contributionTotal,
  visibleAccountCount,
} from "@/features/wealth/lib/dashboard-model";
import type { Wealth } from "@/features/wealth/lib/dashboard-model";

import { InstitutionGroup } from "./institution-group";

export function AccountRegister({ wealth }: { wealth: Wealth }) {
  const total = contributionTotal(wealth);

  if (wealth.institutions.length === 0) {
    return (
      <section className="my-20 flex min-h-112 items-center justify-center gap-8 border-y border-border-default max-[680px]:flex-col max-[680px]:text-center">
        <MoniiMark className="size-20 text-chart-1" />
        <div>
          <span className="font-mono text-label font-medium tracking-label-wide text-content-muted uppercase">
            Account signals
          </span>
          <h2 className="my-3 text-[2.5rem] tracking-[-0.06em]">
            No accounts are visible yet.
          </h2>
          <p className="text-body text-content-muted">
            They will appear after the first successful synchronization.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-20 mb-16 max-[680px]:mt-14">
      <header className="flex items-end justify-between gap-6 border-b border-border-default pb-6 max-[680px]:flex-col max-[680px]:items-start max-[680px]:gap-3">
        <div>
          <span className="font-mono text-label font-medium tracking-label-wide text-content-muted uppercase">
            Latest usable valuations
          </span>
          <h2 className="mt-3 text-[2.5rem] leading-none font-medium tracking-[-0.055em]">
            Account signals
          </h2>
        </div>
        <small className="font-mono text-label font-medium tracking-label-wide text-content-muted uppercase">
          {visibleAccountCount(wealth)} accounts · EUR reporting
        </small>
      </header>
      {wealth.institutions.map((institution, index) => (
        <InstitutionGroup
          index={index}
          institution={institution}
          key={institution.id ?? `unassigned-${index}`}
          total={total}
        />
      ))}
    </section>
  );
}
