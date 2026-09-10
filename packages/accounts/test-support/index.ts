import { getIntegrationDatabase } from "@testkit/postgres";
import {
  accounts,
  accountValuationCandidates,
  institutions,
} from "@monii/postgres/schema";

type NewAccount = typeof accounts.$inferInsert;
type NewInstitution = typeof institutions.$inferInsert;
type NewValuationCandidate = typeof accountValuationCandidates.$inferInsert;
type NewValuationCandidateInput = Pick<NewValuationCandidate, "accountId"> &
  Partial<Omit<NewValuationCandidate, "accountId">>;

export async function insertAccount(
  overrides: Partial<NewAccount> = {},
) {
  const [account] = await getIntegrationDatabase()
    .insert(accounts)
    .values({
      category: "cash",
      managementMode: "external",
      name: "Test account",
      purpose: "personal",
      ...overrides,
    })
    .returning();
  if (!account) throw new Error("Failed to insert the test account");
  return account;
}

export async function insertInstitution(
  overrides: Partial<NewInstitution> = {},
) {
  const [institution] = await getIntegrationDatabase()
    .insert(institutions)
    .values({
      name: "Test institution",
      ...overrides,
    })
    .returning();
  if (!institution) throw new Error("Failed to insert the test institution");
  return institution;
}

export async function insertValuationCandidate(
  input: NewValuationCandidateInput,
) {
  const [candidate] = await getIntegrationDatabase()
    .insert(accountValuationCandidates)
    .values({
      amount: "42.00000000",
      currency: "EUR",
      valuationBasis: "balance",
      valuationMethod: "reported",
      ...input,
    })
    .returning();
  if (!candidate) throw new Error("Failed to insert the valuation candidate");
  return candidate;
}
