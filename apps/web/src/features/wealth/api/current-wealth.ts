import { graphql } from "@/generated/graphql/app/client";

export const currentWealthDashboardQuery = graphql(/* GraphQL */ `
  query CurrentWealthDashboard {
    currentWealth {
      currency
      headlineAmount
      duplicateAdjustedEstimateAmount
      possibleTotalMinimum
      possibleTotalMaximum
      health
      isComplete
      lastSuccessfulSynchronizationAt
      latestSynchronizationStatus
      likelyDuplicateGroupCount
      recordedAt
      institutions {
        id
        name
        contributedAmount
        accounts {
          id
          name
          category
          contributedAmount
          evaluatedAmount
          evaluatedCurrency
          decision
          health
          duplicateRole
          identityConflict
          refreshUncertain
          valuationAt
        }
      }
    }
  }
`);
