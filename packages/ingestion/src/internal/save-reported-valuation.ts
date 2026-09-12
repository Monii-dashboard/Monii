import { AccountValuationCandidate } from "@monii/accounts/models";

import { ReportedAccountValuation } from "../models";

export async function saveReportedValuation(input: Readonly<{
  accountId: string;
  amount: string | null;
  currency: string | null;
  externalAccountObservationId: string;
  recordedAt: Date;
  sourceValidAt: Date | null;
  valuationBasis: "balance" | "estimated_value";
}>): Promise<void> {
  if (input.amount === null) return;
  const candidate = await AccountValuationCandidate.create({
    accountId: input.accountId,
    amount: input.amount,
    currency: input.currency,
    effectiveAt: input.sourceValidAt,
    recordedAt: input.recordedAt,
    valuationBasis: input.valuationBasis,
    valuationMethod: "reported",
  });
  await ReportedAccountValuation.create({
    accountId: input.accountId,
    externalAccountObservationId: input.externalAccountObservationId,
    valuationBasis: input.valuationBasis,
    valuationCandidateId: candidate.id,
  });
}
