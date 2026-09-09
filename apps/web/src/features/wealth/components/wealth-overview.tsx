import type { Wealth } from "@/features/wealth/lib/dashboard-model";
import { visibleAccountCount } from "@/features/wealth/lib/dashboard-model";
import { formatMoney } from "@/features/wealth/lib/format";

import { CapitalSignalList } from "./capital-signal-list";
import styles from "./wealth-overview.module.css";

export function WealthOverview({ wealth }: { wealth: Wealth }) {
  return (
    <section
      aria-label="Wealth overview"
      className={`${styles.surface} grid min-h-135 grid-cols-[minmax(31rem,1.08fr)_minmax(26rem,0.92fr)] overflow-hidden rounded-panel border border-border-default shadow-panel max-[950px]:grid-cols-1 max-[680px]:grid-cols-[minmax(0,1fr)] max-[680px]:rounded-2xl`}
    >
      <div
        className={`${styles.lens} relative grid place-items-center overflow-hidden border-r border-border-default max-[950px]:min-h-130 max-[950px]:border-r-0 max-[950px]:border-b max-[680px]:min-h-97.5`}
      >
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <i className={`${styles.ring} ${styles.ringPrimary}`} />
          <i className={`${styles.ring} ${styles.ringWide}`} />
          <i className={`${styles.ring} ${styles.ringCross}`} />
        </div>
        <div className="relative z-2 flex flex-col items-center">
          <span className="font-mono text-label font-semibold tracking-label-wide text-content-muted uppercase">
            Best-known total
          </span>
          <strong className="my-4 text-[clamp(3rem,5vw,4.9rem)] leading-[0.9] font-medium tracking-[-0.09em] max-[680px]:text-[clamp(2.5rem,13vw,3.35rem)] max-[680px]:whitespace-nowrap">
            {wealth.recordedAt
              ? formatMoney(wealth.headlineAmount, wealth.currency)
              : "—"}
          </strong>
          <small className="font-mono text-label-small font-medium tracking-label text-content-muted uppercase opacity-90">
            {visibleAccountCount(wealth)} accounts · {wealth.institutions.length}{" "}
            sources
          </small>
        </div>
        <span className="absolute right-6 bottom-4 font-mono text-label-small font-medium tracking-label-wide text-content-muted uppercase opacity-85">
          EUR / CURRENT
        </span>
      </div>
      <CapitalSignalList wealth={wealth} />
    </section>
  );
}
