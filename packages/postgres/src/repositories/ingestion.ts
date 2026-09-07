import type { SynchronizationRepository } from "@monii/ingestion";

import {
  createPostgresFinancialPersistence,
  type FinancialRepositoryReporter,
} from "./financial-persistence";

export function createPostgresSynchronizationRepository(
  database?: Parameters<typeof createPostgresFinancialPersistence>[0],
  reporter?: FinancialRepositoryReporter,
): SynchronizationRepository {
  return createPostgresFinancialPersistence(database, reporter);
}

export type { FinancialRepositoryReporter };
