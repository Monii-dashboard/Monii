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

export type IdentityAssessmentReason =
  | "conflicting_account_number"
  | "conflicting_iban"
  | "different_account_category"
  | "different_currency"
  | "different_institution"
  | "fingerprint_key_version_mismatch"
  | "insufficient_matching_evidence"
  | "matching_iban"
  | "matching_reported_name"
  | "missing_currency"
  | "missing_institution"
  | "unknown_account_category";

export type ExternalAccountIdentityAssessment = Readonly<{
  classification: IdentityClassification;
  reasonCodes: readonly IdentityAssessmentReason[];
}>;

/**
 * Mutable labels may suggest review, but only validated provider-boundary
 * identifiers may confirm identity. Monetary values never participate.
 */
export function assessExternalAccountIdentity(
  left: IdentityAccount,
  right: IdentityAccount,
): ExternalAccountIdentityAssessment {
  const reasonCodes: IdentityAssessmentReason[] = [];
  if (!left.institutionId || !right.institutionId) {
    reasonCodes.push("missing_institution");
  } else if (left.institutionId !== right.institutionId) {
    reasonCodes.push("different_institution");
  }
  if (!left.currency || !right.currency) {
    reasonCodes.push("missing_currency");
  } else if (left.currency !== right.currency) {
    reasonCodes.push("different_currency");
  }
  if (left.category === "unknown" || right.category === "unknown") {
    reasonCodes.push("unknown_account_category");
  } else if (left.category !== right.category) {
    reasonCodes.push("different_account_category");
  }
  if (left.evidence.keyVersion !== right.evidence.keyVersion) {
    reasonCodes.push("fingerprint_key_version_mismatch");
  }
  if (reasonCodes.length) return { classification: "distinct", reasonCodes };

  const leftIban = left.evidence.ibanFingerprint;
  const rightIban = right.evidence.ibanFingerprint;
  const leftNumber = left.evidence.accountNumberFingerprint;
  const rightNumber = right.evidence.accountNumberFingerprint;
  if (leftIban && rightIban && leftIban !== rightIban) {
    reasonCodes.push("conflicting_iban");
  }
  if (leftNumber && rightNumber && leftNumber !== rightNumber) {
    reasonCodes.push("conflicting_account_number");
  }
  if (reasonCodes.length) return { classification: "distinct", reasonCodes };
  if (leftIban && leftIban === rightIban) {
    return { classification: "confirmed_duplicate", reasonCodes: ["matching_iban"] };
  }

  return left.evidence.reportedNameFingerprint &&
    left.evidence.reportedNameFingerprint === right.evidence.reportedNameFingerprint
    ? { classification: "likely_duplicate", reasonCodes: ["matching_reported_name"] }
    : { classification: "distinct", reasonCodes: ["insufficient_matching_evidence"] };
}
