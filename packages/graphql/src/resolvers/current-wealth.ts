import {
  getCurrentWealth,
  type CurrentAccountWealth,
  type CurrentInstitutionWealth,
  type CurrentWealth,
} from "@monii/wealth-query";
import { Ctx, Field, Int, ObjectType, Query, Resolver } from "type-graphql";

import type { GraphqlContext } from "../context";

@ObjectType("WealthAccount")
class WealthAccountObject {
  @Field(() => String)
  id = "";

  @Field(() => String)
  name = "";

  @Field(() => String)
  category = "";

  @Field(() => String, { nullable: true })
  contributedAmount: string | null = null;

  @Field(() => String, { nullable: true })
  evaluatedAmount: string | null = null;

  @Field(() => String, { nullable: true })
  evaluatedCurrency: string | null = null;

  @Field(() => String)
  decision = "";

  @Field(() => String, { nullable: true })
  health: string | null = null;

  @Field(() => String)
  duplicateRole = "";

  @Field(() => Boolean)
  identityConflict = false;

  @Field(() => Boolean)
  refreshUncertain = false;

  @Field(() => String, { nullable: true })
  valuationAt: string | null = null;
}

@ObjectType("WealthInstitution")
class WealthInstitutionObject {
  @Field(() => String, { nullable: true })
  id: string | null = null;

  @Field(() => String)
  name = "";

  @Field(() => String)
  contributedAmount = "";

  @Field(() => [WealthAccountObject])
  accounts: WealthAccountObject[] = [];
}

@ObjectType("CurrentWealth")
class CurrentWealthObject {
  @Field(() => String)
  currency = "";

  @Field(() => String)
  headlineAmount = "";

  @Field(() => String)
  duplicateAdjustedEstimateAmount = "";

  @Field(() => String)
  possibleTotalMinimum = "";

  @Field(() => String)
  possibleTotalMaximum = "";

  @Field(() => String)
  health = "";

  @Field(() => Boolean)
  isComplete = false;

  @Field(() => String, { nullable: true })
  lastSuccessfulSynchronizationAt: string | null = null;

  @Field(() => String, { nullable: true })
  latestSynchronizationStatus: string | null = null;

  @Field(() => Int)
  likelyDuplicateGroupCount = 0;

  @Field(() => String, { nullable: true })
  recordedAt: string | null = null;

  @Field(() => [WealthInstitutionObject])
  institutions: WealthInstitutionObject[] = [];
}

function mapAccount(account: CurrentAccountWealth): WealthAccountObject {
  return {
    category: account.category,
    contributedAmount: account.contributedAmount,
    decision: account.decision,
    duplicateRole: account.duplicateRole,
    evaluatedAmount: account.evaluatedAmount,
    evaluatedCurrency: account.evaluatedCurrency,
    health: account.health,
    id: account.accountId,
    identityConflict: account.identityConflict,
    name: account.name,
    refreshUncertain: account.refreshUncertain,
    valuationAt: (
      account.valuationEffectiveAt ?? account.valuationRecordedAt
    )?.toISOString() ?? null,
  };
}

function mapInstitution(
  institution: CurrentInstitutionWealth,
): WealthInstitutionObject {
  return {
    accounts: institution.accounts.map(mapAccount),
    contributedAmount: institution.contributedAmount,
    id: institution.institutionId,
    name: institution.name,
  };
}

function mapCurrentWealth(wealth: CurrentWealth): CurrentWealthObject {
  return {
    currency: wealth.currency,
    duplicateAdjustedEstimateAmount: wealth.duplicateAdjustedEstimateAmount,
    headlineAmount: wealth.headlineAmount,
    health: wealth.health,
    institutions: wealth.institutions.map(mapInstitution),
    isComplete: wealth.isComplete,
    lastSuccessfulSynchronizationAt:
      wealth.lastSuccessfulSynchronizationAt?.toISOString() ?? null,
    latestSynchronizationStatus: wealth.latestSynchronizationStatus,
    likelyDuplicateGroupCount: wealth.likelyDuplicateGroupCount,
    possibleTotalMaximum: wealth.possibleTotalMaximum,
    possibleTotalMinimum: wealth.possibleTotalMinimum,
    recordedAt: wealth.recordedAt?.toISOString() ?? null,
  };
}

@Resolver(() => CurrentWealthObject)
export class CurrentWealthResolver {
  @Query(() => CurrentWealthObject, {
    description:
      "Returns the latest persisted EUR wealth snapshot and its account-level decisions.",
  })
  async currentWealth(
    @Ctx() context: GraphqlContext,
  ): Promise<CurrentWealthObject> {
    return mapCurrentWealth(await getCurrentWealth(context.now()));
  }
}
