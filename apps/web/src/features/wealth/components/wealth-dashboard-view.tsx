import { AppShell } from "@/components/app-shell/app-shell";
import {
  statusLabel,
  type Wealth,
} from "@/features/wealth/lib/dashboard-model";
import { formatRelativeUpdate } from "@/features/wealth/lib/format";

import { AccountRegister } from "./account-register";
import { DataNotices } from "./data-notices";
import { WealthOverview } from "./wealth-overview";

export function WealthDashboardView({ wealth }: { wealth: Wealth }) {
  const healthy = wealth.health === "fresh" && wealth.isComplete;

  return (
    <AppShell
      id="dashboard"
      sectionLabel="Wealth"
      status={{ healthy, label: statusLabel(wealth) }}
    >
      <main className="mx-auto w-[min(1240px,calc(100%-4.8rem))] max-[680px]:w-[calc(100%-2rem)]">
        <header className="flex min-h-40 items-end justify-between max-[680px]:min-h-32">
          <div>
            <span className="font-mono text-label font-medium tracking-label-wide text-content-muted uppercase">
              Portfolio view · 01
            </span>
            <h1 className="mt-3 text-[clamp(3.4rem,6vw,5.8rem)] leading-[0.88] font-medium tracking-display max-[680px]:text-[3.5rem]">
              Wealth
            </h1>
          </div>
          <p className="font-mono text-label font-medium tracking-label-wide text-content-muted uppercase max-[680px]:max-w-32 max-[680px]:text-right max-[680px]:leading-[1.35]">
            {formatRelativeUpdate(wealth.lastSuccessfulSynchronizationAt)}
          </p>
        </header>

        <WealthOverview wealth={wealth} />
        <DataNotices wealth={wealth} />
        <AccountRegister wealth={wealth} />
      </main>
    </AppShell>
  );
}
