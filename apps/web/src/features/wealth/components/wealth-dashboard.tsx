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

const palette = ["#c7ff68", "#a78bfa", "#67e8dc", "#ff8066", "#f5d76e"];

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
    return "conic-gradient(from 210deg, #c7ff68 0 18%, #a78bfa 18% 44%, #67e8dc 44% 72%, rgba(255,255,255,.08) 72% 100%)";
  }

  let cursor = 0;
  const stops = values.map((value, index) => {
    const start = cursor;
    cursor += (value / total) * 100;
    return `${palette[index % palette.length]} ${start}% ${cursor}%`;
  });
  return `conic-gradient(from 210deg, ${stops.join(", ")})`;
}

function StatusPill({ wealth }: { wealth: Wealth }) {
  const isHealthy = wealth.health === "fresh" && wealth.isComplete;

  return (
    <div
      className={`flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium tracking-wide ${
        isHealthy
          ? "border-lime/20 bg-lime/8 text-lime"
          : "border-coral/20 bg-coral/8 text-[#ff9d8a]"
      }`}
    >
      <span className="relative flex size-2">
        <span
          className={`absolute inline-flex size-full animate-ping rounded-full opacity-60 ${isHealthy ? "bg-lime" : "bg-coral"}`}
        />
        <span
          className={`relative inline-flex size-2 rounded-full ${isHealthy ? "bg-lime" : "bg-coral"}`}
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
      <div className="absolute inset-[4%] rounded-full border border-white/8" />
      <div className="absolute inset-[15%] animate-[orbit-turn_32s_linear_infinite] rounded-full border border-dashed border-white/12">
        <span className="absolute left-[13%] top-[9%] size-2.5 rounded-full bg-violet shadow-[0_0_24px_#a78bfa]" />
      </div>
      <div className="absolute inset-[27%] animate-[orbit-turn-reverse_24s_linear_infinite] rounded-full border border-white/10">
        <span className="absolute bottom-[5%] right-[18%] size-2 rounded-full bg-aqua shadow-[0_0_22px_#67e8dc]" />
      </div>
      <div
        className="absolute inset-[20%] rounded-full p-[2px] shadow-[0_0_90px_rgba(199,255,104,0.12)]"
        style={{ backgroundImage: orbitGradient(wealth.institutions) }}
      >
        <div className="flex size-full flex-col items-center justify-center rounded-full bg-[#091410] shadow-[inset_0_0_55px_rgba(0,0,0,0.7)]">
          <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-mist">
            mapped
          </span>
          <span className="mt-1 text-4xl font-light tracking-[-0.08em] text-cloud">
            {accounts.length.toString().padStart(2, "0")}
          </span>
          <span className="text-xs text-mist">
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
            className="absolute size-2.5 rounded-full border-2 border-ink shadow-[0_0_18px_currentColor]"
            style={{
              backgroundColor: palette[index % palette.length],
              color: palette[index % palette.length],
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
    <article className="group relative grid gap-4 border-t border-white/8 py-5 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_minmax(150px,0.7fr)_auto] sm:items-center sm:gap-6">
      <div className="flex min-w-0 items-center gap-4">
        <div
          className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 transition-transform duration-300 group-hover:-rotate-3 group-hover:scale-105"
          style={{ color: accent }}
        >
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-medium text-cloud">
            {account.name}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-mist">
            <span>{formatAccountKind(account.category)}</span>
            <span className="size-0.5 rounded-full bg-white/25" />
            <span className={included ? "text-lime/80" : "text-mist"}>
              {formatDecision(account.decision)}
            </span>
            {needsAttention ? (
              <span className="inline-flex items-center gap-1 text-[#ff9d8a]">
                <AlertIcon className="size-3" />
                Check data
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="min-w-0 pl-[60px] sm:pl-0">
        <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.16em] text-mist/70">
          <span>Contribution</span>
          <span>{included ? `${share.toFixed(0)}%` : "—"}</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-white/8">
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
          className={`text-lg font-medium tracking-tight ${included ? "text-cloud" : "text-mist"}`}
        >
          {amount ? formatMoney(amount, amountCurrency) : "Unavailable"}
        </p>
        {!included && amount ? (
          <p className="mt-0.5 text-[11px] text-mist/60">not in total</p>
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
  const accent = palette[index % palette.length];
  const share = percentage(institution.contributedAmount, contributionBase);

  return (
    <section
      className="overflow-hidden rounded-[28px] border border-white/10 bg-[#0c1b17]/72 px-5 shadow-[0_28px_70px_rgba(0,0,0,0.2)] backdrop-blur-xl sm:px-7"
      style={{ animation: `soft-rise 650ms ${index * 90}ms both` }}
    >
      <header className="flex items-end justify-between gap-5 border-b border-white/8 py-6">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="h-8 w-1 shrink-0 rounded-full"
            style={{ backgroundColor: accent }}
          />
          <div className="min-w-0">
            <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-mist/60">
              Institution {String(index + 1).padStart(2, "0")}
            </p>
            <h2 className="mt-1 truncate text-xl font-medium tracking-tight text-cloud">
              {institution.name}
            </h2>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-medium text-cloud">
            {formatMoney(institution.contributedAmount)}
          </p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-mist/60">
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
    <section className="rounded-[28px] border border-dashed border-white/15 bg-white/[0.025] px-6 py-16 text-center backdrop-blur-sm">
      <div className="mx-auto flex size-14 items-center justify-center rounded-full border border-lime/25 bg-lime/8 text-lime">
        <MoniiMark className="size-7" />
      </div>
      <h2 className="mt-5 text-xl font-medium text-cloud">
        Your orbit is ready
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-mist">
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
          <div className="flex size-10 items-center justify-center rounded-2xl bg-lime text-ink shadow-[0_0_35px_rgba(199,255,104,0.18)]">
            <MoniiMark className="size-6" />
          </div>
          <div>
            <p className="text-lg font-semibold tracking-[-0.04em] text-cloud">
              monii
            </p>
            <p className="font-mono text-[8px] uppercase tracking-[0.28em] text-mist/65">
              wealth view
            </p>
          </div>
        </div>
        <StatusPill wealth={wealth} />
      </header>

      <main className="relative z-10 mx-auto w-full max-w-7xl px-5 pb-16 pt-5 sm:px-8 lg:px-10 lg:pb-24">
        <section className="relative overflow-hidden rounded-[34px] border border-white/10 bg-[#0b1916]/70 shadow-[0_35px_120px_rgba(0,0,0,0.34)] backdrop-blur-2xl">
          <div className="absolute -left-20 top-1/2 h-48 w-48 -translate-y-1/2 rounded-full bg-lime/10 blur-3xl" />
          <div className="grid min-h-[500px] lg:grid-cols-[1.15fr_0.85fr]">
            <div className="relative flex flex-col justify-between px-6 py-9 sm:px-10 sm:py-12 lg:px-14 lg:py-14">
              <div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-lime">
                    Current wealth
                  </span>
                  <span className="h-px w-12 bg-gradient-to-r from-lime/70 to-transparent" />
                </div>
                <h1 className="mt-5 max-w-xl text-4xl font-light leading-[1.03] tracking-[-0.065em] text-cloud sm:text-6xl">
                  Everything you own,
                  <span className="block text-mist">in one orbit.</span>
                </h1>
              </div>

              <div className="mt-14 lg:mt-16">
                <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-mist/65">
                  Best-known total
                </p>
                <p className="mt-2 text-[clamp(3.25rem,9vw,6.8rem)] font-light leading-none tracking-[-0.085em] text-cloud">
                  {hasSnapshot
                    ? formatMoney(wealth.headlineAmount, wealth.currency)
                    : "—"}
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-mist">
                  <span>
                    {formatRelativeUpdate(
                      wealth.lastSuccessfulSynchronizationAt,
                    )}
                  </span>
                  <span className="hidden size-1 rounded-full bg-white/20 sm:block" />
                  <span>
                    {accountCount} account{accountCount === 1 ? "" : "s"} across{" "}
                    {wealth.institutions.length} institution
                    {wealth.institutions.length === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
            </div>

            <div className="relative flex items-center border-t border-white/8 bg-white/[0.018] px-8 py-10 lg:border-l lg:border-t-0">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(199,255,104,0.08),transparent_54%)]" />
              <Orbit wealth={wealth} />
            </div>
          </div>
        </section>

        {!wealth.isComplete || hasRange ? (
          <aside className="mt-5 grid gap-3 sm:grid-cols-2">
            {!wealth.isComplete ? (
              <div className="flex items-start gap-3 rounded-2xl border border-coral/15 bg-coral/[0.06] px-4 py-4 text-sm text-[#ffc0b3]">
                <AlertIcon className="mt-0.5 size-4 shrink-0" />
                <p>
                  This is a partial view. Accounts without a usable value remain
                  visible below.
                </p>
              </div>
            ) : null}
            {hasRange ? (
              <div className="rounded-2xl border border-violet/20 bg-violet/[0.07] px-4 py-4 text-sm text-[#cbbcff]">
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
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-lime">
                The ledger
              </p>
              <h2 className="mt-2 text-3xl font-light tracking-[-0.055em] text-cloud sm:text-4xl">
                Accounts in view
              </h2>
            </div>
            <p className="hidden max-w-xs text-right text-sm leading-6 text-mist sm:block">
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

        <footer className="mt-12 flex items-center justify-between border-t border-white/8 pt-6 font-mono text-[9px] uppercase tracking-[0.22em] text-mist/50">
          <span>EUR reporting</span>
          <span>Last-valid values preserved</span>
        </footer>
      </main>
    </>
  );
}

function DashboardBackdrop() {
  const auroraStyle = {
    animation: "aurora-drift 16s ease-in-out infinite",
  } satisfies CSSProperties;

  return (
    <div
      className="pointer-events-none fixed inset-0 overflow-hidden"
      aria-hidden="true"
    >
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:linear-gradient(to_bottom,black,transparent_78%)]" />
      <div
        className="absolute -left-[15vw] -top-[25vh] h-[70vh] w-[70vw] rounded-full bg-[radial-gradient(ellipse,rgba(167,139,250,0.17),rgba(103,232,220,0.07)_42%,transparent_70%)] blur-3xl"
        style={auroraStyle}
      />
      <div
        className="absolute -right-[20vw] top-[20vh] h-[75vh] w-[65vw] rounded-full bg-[radial-gradient(ellipse,rgba(199,255,104,0.12),rgba(255,128,102,0.04)_48%,transparent_72%)] blur-3xl"
        style={{
          ...auroraStyle,
          animationDelay: "-8s",
          animationDirection: "reverse",
        }}
      />
      <div className="absolute left-1/2 top-1/3 size-72 -translate-x-1/2 rounded-full border border-white/[0.035] shadow-[0_0_120px_rgba(103,232,220,0.06)]" />
    </div>
  );
}

function LoadingDashboard() {
  return (
    <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-6 sm:px-8 lg:px-10">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-2xl bg-lime text-ink">
          <MoniiMark className="size-6" />
        </div>
        <span className="text-lg font-semibold text-cloud">monii</span>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center py-24 text-center">
        <div className="relative size-24">
          <div className="absolute inset-0 animate-[orbit-turn_2.6s_linear_infinite] rounded-full border border-dashed border-lime/40" />
          <div className="absolute inset-6 rounded-full bg-lime/20 blur-lg [animation:breathe_1.8s_ease-in-out_infinite]" />
          <div className="absolute inset-[46%] rounded-full bg-lime" />
        </div>
        <p className="mt-7 font-mono text-[10px] uppercase tracking-[0.3em] text-mist">
          Mapping your wealth
        </p>
      </div>
    </div>
  );
}

function ErrorDashboard({ retry }: { retry: () => void }) {
  return (
    <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-3xl items-center px-5 py-16">
      <section className="w-full rounded-[32px] border border-coral/20 bg-[#0c1b17]/80 p-8 text-center shadow-2xl backdrop-blur-xl sm:p-12">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-coral/10 text-coral">
          <AlertIcon className="size-6" />
        </div>
        <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.28em] text-coral">
          Signal lost
        </p>
        <h1 className="mt-3 text-3xl font-light tracking-[-0.05em] text-cloud">
          Your wealth view could not be loaded.
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-mist">
          Your stored financial data is untouched. Reconnect to the dashboard to try
          the read again.
        </p>
        <button
          className="mt-7 rounded-full bg-lime px-5 py-3 text-sm font-semibold text-ink transition hover:scale-[1.02] hover:bg-[#d5ff8c] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime"
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
    <div className="relative min-h-screen overflow-hidden bg-ink">
      <DashboardBackdrop />
      {loading && !data ? <LoadingDashboard /> : null}
      {error && !data ? <ErrorDashboard retry={() => void refetch()} /> : null}
      {data ? <DashboardContent wealth={data.currentWealth} /> : null}
    </div>
  );
}
