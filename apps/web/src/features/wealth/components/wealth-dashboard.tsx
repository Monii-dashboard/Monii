"use client";

import { useQuery } from "@apollo/client/react";
import type { CSSProperties } from "react";

import type { CurrentWealthDashboardQuery } from "@/generated/graphql/app/client/graphql";
import { currentWealthDashboardQuery } from "@/features/wealth/api/current-wealth";
import {
  formatAccountKind,
  formatDecision,
  formatMoney,
  formatRelativeUpdate,
} from "@/features/wealth/lib/format";

import { AlertIcon, CashIcon, InvestmentIcon, MoniiMark } from "./icons";

type Wealth = CurrentWealthDashboardQuery["currentWealth"];
type Institution = Wealth["institutions"][number];
type Account = Institution["accounts"][number];

const chartPalette = [
  "var(--theme-color-chart-1)",
  "var(--theme-color-chart-2)",
  "var(--theme-color-chart-3)",
  "var(--theme-color-chart-4)",
  "var(--theme-color-chart-5)",
];

const statusPillStyles = {
  healthy: "border-accent-muted bg-accent-subtle text-accent",
  attention: "border-danger-outline bg-danger/8 text-danger-content",
} as const;

function healthCopy(health: string, isComplete: boolean) {
  if (health === "synchronization_failed") return "Sync interrupted";
  if (health === "stale") return "Needs an update";
  if (!isComplete) return "Partial view";
  return "All in sync";
}

function percentage(amount: string | null, total: number) {
  const numericAmount = Math.abs(Number(amount ?? 0));
  if (!Number.isFinite(numericAmount) || total <= 0) return 0;
  return Math.min(100, (numericAmount / total) * 100);
}

function totalAbsoluteContribution(wealth: Wealth) {
  return wealth.institutions.reduce(
    (total, institution) =>
      total +
      institution.accounts.reduce(
        (subtotal, account) =>
          subtotal + Math.abs(Number(account.contributedAmount ?? 0) || 0),
        0,
      ),
    0,
  );
}

function orbitGradient(institutions: readonly Institution[]) {
  const values = institutions.map((institution) =>
    Math.max(0, Number(institution.contributedAmount) || 0),
  );
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return "conic-gradient(from 210deg, var(--theme-color-chart-1) 0 18%, var(--theme-color-chart-2) 18% 44%, var(--theme-color-chart-3) 44% 72%, var(--theme-color-border-subtle) 72% 100%)";
  }

  let cursor = 0;
  const stops = values.map((value, index) => {
    const start = cursor;
    cursor += (value / total) * 100;
    return `${chartPalette[index % chartPalette.length]} ${start}% ${cursor}%`;
  });
  return `conic-gradient(from 210deg, ${stops.join(", ")})`;
}

function StatusPill({ wealth }: { wealth: Wealth }) {
  const isHealthy = wealth.health === "fresh" && wealth.isComplete;
  const tone = isHealthy ? "healthy" : "attention";

  return (
    <div
      className={`flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium tracking-wide ${statusPillStyles[tone]}`}
    >
      <span className="relative flex size-2">
        <span
          className={`absolute inline-flex size-full animate-ping rounded-full opacity-60 ${isHealthy ? "bg-accent" : "bg-danger"}`}
        />
        <span
          className={`relative inline-flex size-2 rounded-full ${isHealthy ? "bg-accent" : "bg-danger"}`}
        />
      </span>
      {healthCopy(wealth.health, wealth.isComplete)}
    </div>
  );
}

function Orbit({ wealth }: { wealth: Wealth }) {
  const accounts = wealth.institutions.flatMap(
    (institution) => institution.accounts,
  );
  const orbitAccounts = accounts.slice(0, 6);

  return (
    <div
      className="relative mx-auto aspect-square w-full max-w-[390px]"
      aria-hidden="true"
    >
      <div className="absolute inset-[4%] rounded-full border border-border-subtle" />
      <div className="absolute inset-[15%] animate-orbit rounded-full border border-dashed border-border-orbit">
        <span className="absolute left-[13%] top-[9%] size-2.5 rounded-full bg-chart-2 shadow-orbit-primary" />
      </div>
      <div className="absolute inset-[27%] animate-orbit-reverse rounded-full border border-border-default">
        <span className="absolute bottom-[5%] right-[18%] size-2 rounded-full bg-chart-3 shadow-orbit-secondary" />
      </div>
      <div
        className="absolute inset-[20%] rounded-full p-[2px] shadow-orbit-ring"
        style={{ backgroundImage: orbitGradient(wealth.institutions) }}
      >
        <div className="flex size-full flex-col items-center justify-center rounded-full bg-surface-solid shadow-orbit-inner">
          <span className="font-mono text-label uppercase tracking-label text-content-muted">
            mapped
          </span>
          <span className="mt-1 text-4xl font-light tracking-orbit text-content">
            {accounts.length.toString().padStart(2, "0")}
          </span>
          <span className="text-xs text-content-muted">
            account{accounts.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>
      {orbitAccounts.map((account, index) => {
        const angle =
          (index / Math.max(orbitAccounts.length, 1)) * Math.PI * 2 -
          Math.PI / 2;
        const left = 50 + Math.cos(angle) * 45;
        const top = 50 + Math.sin(angle) * 45;
        return (
          <span
            key={account.id}
            className="absolute size-2.5 rounded-full border-2 border-canvas shadow-orbit-point"
            style={{
              backgroundColor: chartPalette[index % chartPalette.length],
              color: chartPalette[index % chartPalette.length],
              left: `${left}%`,
              top: `${top}%`,
              transform: "translate(-50%, -50%)",
            }}
          />
        );
      })}
    </div>
  );
}

function AccountRow({
  account,
  accent,
  contributionBase,
}: {
  account: Account;
  accent: string;
  contributionBase: number;
}) {
  const included = account.decision === "included";
  const amount = account.contributedAmount ?? account.evaluatedAmount;
  const amountCurrency = included
    ? "EUR"
    : (account.evaluatedCurrency ?? "EUR");
  const share = percentage(account.contributedAmount, contributionBase);
  const Icon = account.category === "investment" ? InvestmentIcon : CashIcon;
  const needsAttention =
    account.health === "stale" ||
    account.health === "synchronization_failed" ||
    account.identityConflict;

  return (
    <article className="group relative grid gap-4 border-t border-border-subtle py-5 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_minmax(150px,0.7fr)_auto] sm:items-center sm:gap-6">
      <div className="flex min-w-0 items-center gap-4">
        <div
          className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-border-default bg-surface-overlay transition-transform duration-300 group-hover:-rotate-3 group-hover:scale-105"
          style={{ color: accent }}
        >
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-body-compact font-medium text-content">
            {account.name}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-content-muted">
            <span>{formatAccountKind(account.category)}</span>
            <span className="size-0.5 rounded-full bg-decoration" />
            <span className={included ? "text-accent/80" : "text-content-muted"}>
              {formatDecision(account.decision)}
            </span>
            {needsAttention ? (
              <span className="inline-flex items-center gap-1 text-danger-content">
                <AlertIcon className="size-3" />
                Check data
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="min-w-0 pl-[60px] sm:pl-0">
        <div className="mb-2 flex items-center justify-between font-mono text-label uppercase tracking-label-tight text-content-muted/70">
          <span>Contribution</span>
          <span>{included ? `${share.toFixed(0)}%` : "—"}</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-track">
          <div
            className="h-full rounded-full transition-[width] duration-700"
            style={{
              backgroundColor: accent,
              width: `${included ? share : 0}%`,
            }}
          />
        </div>
      </div>

      <div className="pl-[60px] text-left sm:min-w-36 sm:pl-0 sm:text-right">
        <p
          className={`text-lg font-medium tracking-tight ${included ? "text-content" : "text-content-muted"}`}
        >
          {amount ? formatMoney(amount, amountCurrency) : "Unavailable"}
        </p>
        {!included && amount ? (
          <p className="mt-0.5 text-caption text-content-muted/60">not in total</p>
        ) : null}
      </div>
    </article>
  );
}

function InstitutionGroup({
  institution,
  index,
  contributionBase,
}: {
  institution: Institution;
  index: number;
  contributionBase: number;
}) {
  const accent = chartPalette[index % chartPalette.length];
  const share = percentage(institution.contributedAmount, contributionBase);

  return (
    <section
      className="animate-reveal overflow-hidden rounded-card border border-border-default bg-surface px-5 shadow-panel backdrop-blur-xl sm:px-7"
      style={{ animationDelay: `${index * 90}ms` }}
    >
      <header className="flex items-end justify-between gap-5 border-b border-border-subtle py-6">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="h-8 w-1 shrink-0 rounded-full"
            style={{ backgroundColor: accent }}
          />
          <div className="min-w-0">
            <p className="font-mono text-label-compact uppercase tracking-label-relaxed text-content-muted/60">
              Institution {String(index + 1).padStart(2, "0")}
            </p>
            <h2 className="mt-1 truncate text-xl font-medium tracking-tight text-content">
              {institution.name}
            </h2>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-medium text-content">
            {formatMoney(institution.contributedAmount)}
          </p>
          <p className="mt-1 font-mono text-label uppercase tracking-label-tight text-content-muted/60">
            {share.toFixed(0)}% of known
          </p>
        </div>
      </header>
      <div>
        {institution.accounts.map((account) => (
          <AccountRow
            account={account}
            accent={accent}
            contributionBase={contributionBase}
            key={account.id}
          />
        ))}
      </div>
    </section>
  );
}

function EmptyLedger() {
  return (
    <section className="rounded-card border border-dashed border-border-strong bg-surface-faint px-6 py-16 text-center backdrop-blur-sm">
      <div className="mx-auto flex size-14 items-center justify-center rounded-full border border-accent-outline bg-accent-subtle text-accent">
        <MoniiMark className="size-7" />
      </div>
      <h2 className="mt-5 text-xl font-medium text-content">
        Your orbit is ready
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-content-muted">
        Your accounts will appear here after the first successful synchronization.
        Unknown wealth is kept unknown—Monii never turns missing values into zero.
      </p>
    </section>
  );
}

function DashboardContent({ wealth }: { wealth: Wealth }) {
  const accountCount = wealth.institutions.reduce(
    (total, institution) => total + institution.accounts.length,
    0,
  );
  const contributionBase = totalAbsoluteContribution(wealth);
  const hasSnapshot = wealth.recordedAt !== null;
  const hasRange = wealth.likelyDuplicateGroupCount > 0;

  return (
    <>
      <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-6 sm:px-8 lg:px-10">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-2xl bg-accent text-content-on-accent shadow-brand">
            <MoniiMark className="size-6" />
          </div>
          <div>
            <p className="text-lg font-semibold tracking-brand text-content">
              monii
            </p>
            <p className="font-mono text-label-micro uppercase tracking-label text-content-muted/65">
              wealth view
            </p>
          </div>
        </div>
        <StatusPill wealth={wealth} />
      </header>

      <main className="relative z-10 mx-auto w-full max-w-7xl px-5 pb-16 pt-5 sm:px-8 lg:px-10 lg:pb-24">
        <section className="relative overflow-hidden rounded-hero border border-border-default bg-surface-hero shadow-hero backdrop-blur-2xl">
          <div className="absolute -left-20 top-1/2 h-48 w-48 -translate-y-1/2 rounded-full bg-accent-soft blur-3xl" />
          <div className="grid min-h-[500px] lg:grid-cols-[1.15fr_0.85fr]">
            <div className="relative flex flex-col justify-between px-6 py-9 sm:px-10 sm:py-12 lg:px-14 lg:py-14">
              <div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-label uppercase tracking-label text-accent">
                    Current wealth
                  </span>
                  <span className="h-px w-12 bg-gradient-to-r from-accent/70 to-transparent" />
                </div>
                <h1 className="mt-5 max-w-xl text-4xl font-light leading-display tracking-display text-content sm:text-6xl">
                  Everything you own,
                  <span className="block text-content-muted">in one orbit.</span>
                </h1>
              </div>

              <div className="mt-14 lg:mt-16">
                <p className="font-mono text-label uppercase tracking-label-relaxed text-content-muted/65">
                  Best-known total
                </p>
                <p className="mt-2 text-wealth font-light tracking-wealth text-content">
                  {hasSnapshot
                    ? formatMoney(wealth.headlineAmount, wealth.currency)
                    : "—"}
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-content-muted">
                  <span>
                    {formatRelativeUpdate(
                      wealth.lastSuccessfulSynchronizationAt,
                    )}
                  </span>
                  <span className="hidden size-1 rounded-full bg-decoration/80 sm:block" />
                  <span>
                    {accountCount} account{accountCount === 1 ? "" : "s"} across{" "}
                    {wealth.institutions.length} institution
                    {wealth.institutions.length === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
            </div>

            <div className="relative flex items-center border-t border-border-subtle bg-surface-glass px-8 py-10 lg:border-l lg:border-t-0">
              <div
                className="absolute inset-0"
                style={{ backgroundImage: "var(--theme-effect-hero-glow)" }}
              />
              <Orbit wealth={wealth} />
            </div>
          </div>
        </section>

        {!wealth.isComplete || hasRange ? (
          <aside className="mt-5 grid gap-3 sm:grid-cols-2">
            {!wealth.isComplete ? (
              <div className="flex items-start gap-3 rounded-2xl border border-danger-outline-subtle bg-danger-subtle px-4 py-4 text-sm text-danger-content-strong">
                <AlertIcon className="mt-0.5 size-4 shrink-0" />
                <p>
                  This is a partial view. Accounts without a usable value remain
                  visible below.
                </p>
              </div>
            ) : null}
            {hasRange ? (
              <div className="rounded-2xl border border-info-outline bg-info-subtle px-4 py-4 text-sm text-info-content">
                Duplicate-adjusted estimate:{" "}
                {formatMoney(wealth.duplicateAdjustedEstimateAmount)}. Possible
                range: {formatMoney(wealth.possibleTotalMinimum)}–
                {formatMoney(wealth.possibleTotalMaximum)}.
              </div>
            ) : null}
          </aside>
        ) : null}

        <section className="mt-14 sm:mt-18">
          <div className="mb-6 flex items-end justify-between gap-6">
            <div>
              <p className="font-mono text-label uppercase tracking-label text-accent">
                The ledger
              </p>
              <h2 className="mt-2 text-3xl font-light tracking-heading text-content sm:text-4xl">
                Accounts in view
              </h2>
            </div>
            <p className="hidden max-w-xs text-right text-sm leading-6 text-content-muted sm:block">
              Every value reconciles with the total above. Missing data stays visible.
            </p>
          </div>

          {wealth.institutions.length === 0 ? (
            <EmptyLedger />
          ) : (
            <div className="grid gap-4">
              {wealth.institutions.map((institution, index) => (
                <InstitutionGroup
                  contributionBase={contributionBase}
                  index={index}
                  institution={institution}
                  key={institution.id ?? `unassigned-${index}`}
                />
              ))}
            </div>
          )}
        </section>

        <footer className="mt-12 flex items-center justify-between border-t border-border-subtle pt-6 font-mono text-label-compact uppercase tracking-footer text-content-muted/50">
          <span>EUR reporting</span>
          <span>Last-valid values preserved</span>
        </footer>
      </main>
    </>
  );
}

function DashboardBackdrop() {
  const dashboardGridStyle = {
    backgroundImage: "var(--theme-effect-dashboard-grid)",
    backgroundSize: "72px 72px",
    maskImage: "linear-gradient(to bottom, black, transparent 78%)",
  } satisfies CSSProperties;

  return (
    <div
      className="pointer-events-none fixed inset-0 overflow-hidden"
      aria-hidden="true"
    >
      <div className="absolute inset-0" style={dashboardGridStyle} />
      <div
        className="absolute -left-[15vw] -top-[25vh] h-[70vh] w-[70vw] animate-aurora rounded-full blur-3xl"
        style={{ backgroundImage: "var(--theme-effect-aurora-primary)" }}
      />
      <div
        className="absolute -right-[20vw] top-[20vh] h-[75vh] w-[65vw] animate-aurora rounded-full blur-3xl"
        style={{
          backgroundImage: "var(--theme-effect-aurora-secondary)",
          animationDelay: "-8s",
          animationDirection: "reverse",
        }}
      />
      <div className="absolute left-1/2 top-1/3 size-72 -translate-x-1/2 rounded-full border border-border-atmosphere shadow-atmosphere" />
    </div>
  );
}

function LoadingDashboard() {
  return (
    <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-6 sm:px-8 lg:px-10">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-2xl bg-accent text-content-on-accent">
          <MoniiMark className="size-6" />
        </div>
        <span className="text-lg font-semibold text-content">monii</span>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center py-24 text-center">
        <div className="relative size-24">
          <div className="absolute inset-0 animate-orbit-loader rounded-full border border-dashed border-accent-emphasis" />
          <div className="absolute inset-6 animate-breathe rounded-full bg-accent-muted blur-lg" />
          <div className="absolute inset-[46%] rounded-full bg-accent" />
        </div>
        <p className="mt-7 font-mono text-label uppercase tracking-label-wide text-content-muted">
          Mapping your wealth
        </p>
      </div>
    </div>
  );
}

function ErrorDashboard({ retry }: { retry: () => void }) {
  return (
    <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-3xl items-center px-5 py-16">
      <section className="w-full rounded-dialog border border-danger-outline bg-surface-strong p-8 text-center shadow-dialog backdrop-blur-xl sm:p-12">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-danger-soft text-danger">
          <AlertIcon className="size-6" />
        </div>
        <p className="mt-6 font-mono text-label uppercase tracking-label text-danger">
          Signal lost
        </p>
        <h1 className="mt-3 text-3xl font-light tracking-tighter text-content">
          Your wealth view could not be loaded.
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-content-muted">
          Your stored financial data is untouched. Reconnect to the dashboard to try
          the read again.
        </p>
        <button
          className="mt-7 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-content-on-accent transition hover:scale-[1.02] hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
          onClick={retry}
          type="button"
        >
          Try again
        </button>
      </section>
    </div>
  );
}

export function WealthDashboard() {
  const { data, error, loading, refetch } = useQuery(
    currentWealthDashboardQuery,
    { fetchPolicy: "cache-and-network" },
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-canvas">
      <DashboardBackdrop />
      {loading && !data ? <LoadingDashboard /> : null}
      {error && !data ? <ErrorDashboard retry={() => void refetch()} /> : null}
      {data ? <DashboardContent wealth={data.currentWealth} /> : null}
    </div>
  );
}
