import type { CurrentWealthDashboardQuery } from "@/generated/graphql/app/client/graphql";

import { formatMoney } from "./format";

export type Wealth = CurrentWealthDashboardQuery["currentWealth"];
export type Institution = Wealth["institutions"][number];
export type Account = Institution["accounts"][number];

const signalColors = [
  "var(--theme-color-chart-1)",
  "var(--theme-color-chart-2)",
  "var(--theme-color-chart-3)",
  "var(--theme-color-chart-4)",
  "var(--theme-color-chart-5)",
];

export function signalColor(index: number) {
  return signalColors[index % signalColors.length];
}

export function contributionTotal(wealth: Wealth) {
  return wealth.institutions.reduce(
    (sum, institution) =>
      sum + Math.max(0, Number(institution.contributedAmount) || 0),
    0,
  );
}

export function shareOf(amount: string | null, total: number) {
  const value = Math.max(0, Number(amount) || 0);
  return total > 0 ? Math.min(100, (value / total) * 100) : 0;
}

export function visibleAccountCount(wealth: Wealth) {
  return wealth.institutions.reduce(
    (count, institution) => count + institution.accounts.length,
    0,
  );
}

export function statusLabel(wealth: Wealth) {
  if (wealth.health === "synchronization_failed") return "Sync interrupted";
  if (wealth.health === "stale") return "Update overdue";
  if (!wealth.isComplete) return "Partial total";
  return "All sources current";
}

export function accountValue(account: Account) {
  const amount = account.contributedAmount ?? account.evaluatedAmount;
  const currency =
    account.decision === "included"
      ? "EUR"
      : (account.evaluatedCurrency ?? "EUR");

  return amount ? formatMoney(amount, currency) : "Unavailable";
}
