import type { AccountCategory } from "@monii/accounts";

export type AccountIdentityEvidence = Readonly<{
  accountNumberFingerprint: string | null;
  ibanFingerprint: string | null;
  keyVersion: string;
  reportedNameFingerprint: string | null;
}>;

export type IdentityAccount = Readonly<{
  accountId: string;
  category: AccountCategory;
  currency: string | null;
  evidence: AccountIdentityEvidence;
  externalAccountId: string;
  institutionId: string | null;
}>;

export type IdentityClassification =
  | "confirmed_duplicate"
  | "distinct"
  | "likely_duplicate";

/**
 * Mutable labels may suggest review, but only validated provider-boundary
 * identifiers may confirm identity. Monetary values never participate.
 */
export function classifyExternalAccountIdentity(
  left: IdentityAccount,
  right: IdentityAccount,
): IdentityClassification {
  if (
    !left.institutionId ||
    left.institutionId !== right.institutionId ||
    !left.currency ||
    left.currency !== right.currency ||
    left.category !== right.category ||
    left.category === "unknown" ||
    left.evidence.keyVersion !== right.evidence.keyVersion
  ) {
    return "distinct";
  }

  const leftIban = left.evidence.ibanFingerprint;
  const rightIban = right.evidence.ibanFingerprint;
  const leftNumber = left.evidence.accountNumberFingerprint;
  const rightNumber = right.evidence.accountNumberFingerprint;
  if (
    (leftIban && rightIban && leftIban !== rightIban) ||
    (leftNumber && rightNumber && leftNumber !== rightNumber)
  ) {
    return "distinct";
  }
  if (leftIban && leftIban === rightIban) return "confirmed_duplicate";

  return left.evidence.reportedNameFingerprint &&
    left.evidence.reportedNameFingerprint === right.evidence.reportedNameFingerprint
    ? "likely_duplicate"
    : "distinct";
}
