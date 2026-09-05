import type { AccountKind } from "./wealth";

export type AccountIdentityEvidence = Readonly<{
  accountNumberFingerprint: string | null;
  ibanFingerprint: string | null;
  keyVersion: string;
  sourceNameFingerprint: string;
}>;

export type IdentityAccount = Readonly<{
  accountId: string;
  currency: string | null;
  evidence: AccountIdentityEvidence;
  institutionId: string;
  kind: AccountKind;
  referenceId: string;
}>;

export type IdentityClassification =
  | "confirmed_duplicate"
  | "distinct"
  | "likely_duplicate";

function supportsIdentity(kind: AccountKind) {
  return kind === "cash" || kind === "investment";
}

/**
 * Mutable labels may suggest a review candidate, but only a valid
 * provider-boundary IBAN fingerprint can confirm a duplicate. Balances never
 * participate in identity.
 */
export function classifyAccountIdentity(
  left: IdentityAccount,
  right: IdentityAccount,
): IdentityClassification {
  if (
    left.institutionId !== right.institutionId ||
    !left.currency ||
    left.currency !== right.currency ||
    left.kind !== right.kind ||
    !supportsIdentity(left.kind) ||
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

  if (leftIban && leftIban === rightIban) {
    return "confirmed_duplicate";
  }

  return left.evidence.sourceNameFingerprint ===
    right.evidence.sourceNameFingerprint
    ? "likely_duplicate"
    : "distinct";
}

export function connectedIdentityGroups(
  accountIds: readonly string[],
  pairs: readonly Readonly<{ leftAccountId: string; rightAccountId: string }>[],
): readonly (readonly string[])[] {
  const parent = new Map(accountIds.map((id) => [id, id]));
  const find = (id: string): string => {
    const current = parent.get(id);
    if (!current || current === id) return id;
    const root = find(current);
    parent.set(id, root);
    return root;
  };

  for (const pair of pairs) {
    const left = find(pair.leftAccountId);
    const right = find(pair.rightAccountId);
    if (left !== right) parent.set(right, left);
  }

  const groups = new Map<string, string[]>();
  for (const id of accountIds) {
    const root = find(id);
    groups.set(root, [...(groups.get(root) ?? []), id]);
  }

  return [...groups.values()].filter((group) => group.length > 1);
}
