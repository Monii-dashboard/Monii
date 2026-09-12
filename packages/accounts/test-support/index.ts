import {
  Account,
  AccountValuationCandidate,
  Institution,
} from "@monii/accounts/models";

type NewAccount = Parameters<typeof Account.create>[0];
type NewInstitution = Parameters<typeof Institution.create>[0];
type NewValuationCandidate = Parameters<
  typeof AccountValuationCandidate.create
>[0];
type NewValuationCandidateInput = Pick<NewValuationCandidate, "accountId"> &
  Partial<Omit<NewValuationCandidate, "accountId">>;

export async function insertAccount(
  overrides: Partial<NewAccount> = {},
) {
  return Account.create({
    category: "cash",
    managementMode: "external",
    name: "Test account",
    purpose: "personal",
    ...overrides,
  });
}

export async function insertInstitution(
  overrides: Partial<NewInstitution> = {},
) {
  return Institution.create({
    name: "Test institution",
    ...overrides,
  });
}

export async function insertValuationCandidate(
  input: NewValuationCandidateInput,
) {
  return AccountValuationCandidate.create({
    amount: "42.00000000",
    currency: "EUR",
    valuationBasis: "balance",
    valuationMethod: "reported",
    ...input,
  });
}
