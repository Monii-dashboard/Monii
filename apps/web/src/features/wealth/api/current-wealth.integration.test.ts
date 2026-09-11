import { webGraphql } from "@testkit/apps/web";
import { describe, expect, it } from "@testkit/integration";
import {
  insertAccount,
  insertInstitution,
  insertValuationCandidate,
} from "@testkit/packages/accounts";
import {
  insertSnapshot,
  insertSnapshotAccountDecision,
} from "@testkit/packages/wealth-query";

import { currentWealthDashboardQuery } from "./current-wealth";

describe("current wealth web GraphQL endpoint", () => {
  it("executes the production dashboard document against persisted state", async () => {
    const institution = await insertInstitution({ name: "Northbank" });
    const account = await insertAccount({
      institutionId: institution.id,
      name: "Everyday",
    });
    const candidate = await insertValuationCandidate({
      accountId: account.id,
      amount: "1250.50000000",
    });
    const snapshot = await insertSnapshot({
      duplicateAdjustedEstimateAmount: "1250.50000000",
      headlineAmount: "1250.50000000",
    });
    await insertSnapshotAccountDecision({
      accountId: account.id,
      accountName: account.name,
      contributedAmount: "1250.50000000",
      duplicateAdjustedAmount: "1250.50000000",
      evaluatedAmount: "1250.50000000",
      evaluatedValuationCandidateId: candidate.id,
      institutionId: institution.id,
      institutionName: institution.name,
      snapshotId: snapshot.id,
    });

    const result = await webGraphql.execute(currentWealthDashboardQuery, {});

    expect(result.errors).toBeUndefined();
    expect(result.data?.currentWealth).toMatchObject({
      headlineAmount: "1250.50000000",
      institutions: [{
        accounts: [{ name: "Everyday" }],
        name: "Northbank",
      }],
    });
  });
});
