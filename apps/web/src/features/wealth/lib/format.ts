export function formatMoney(amount: string, currency = "EUR") {
  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount)) return `${amount} ${currency}`;

  return new Intl.NumberFormat("fr-FR", {
    currency,
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
    style: "currency",
  }).format(numericAmount);
}

export function formatRelativeUpdate(value: string | null) {
  if (!value) return "No successful sync yet";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Update time unavailable";

  return `Updated ${new Intl.DateTimeFormat("en", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  }).format(date)}`;
}

const decisionLabels: Record<string, string> = {
  excluded_archived: "Archived",
  excluded_business: "Business account",
  excluded_by_policy: "Not included",
  excluded_external_lifecycle: "Unavailable at source",
  excluded_merged: "Merged account",
  included: "Included",
  known_unsupported_account: "Unsupported account",
  missing_currency: "Currency unavailable",
  missing_selected_valuation: "Value unavailable",
  unknown_account_category: "Type unavailable",
  unsupported_currency: "Non-EUR account",
};

export function formatDecision(decision: string) {
  return decisionLabels[decision] ?? "Unavailable";
}

export function formatAccountKind(category: string) {
  if (category === "cash") return "Cash";
  if (category === "investment") return "Investment";
  return "Other";
}
