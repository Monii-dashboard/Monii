import type { WealthCalculationRepository } from "@monii/wealth-calculation";
import type { WealthQueryRepository } from "@monii/wealth-query";

import {
  createPostgresFinancialPersistence,
  type FinancialRepositoryReporter,
} from "./financial-persistence";

type DatabaseArgument = Parameters<typeof createPostgresFinancialPersistence>[0];

export function createPostgresWealthCalculationRepository(
  database?: DatabaseArgument,
  reporter?: FinancialRepositoryReporter,
): WealthCalculationRepository {
  return createPostgresFinancialPersistence(database, reporter);
}

export function createPostgresWealthQueryRepository(
  database?: DatabaseArgument,
): WealthQueryRepository {
  return createPostgresFinancialPersistence(database);
}

export type { FinancialRepositoryReporter };
