import { createPostgresSynchronizationRepository } from "@monii/postgres/ingestion";
import { describe } from "@testkit/integration";

import { synchronizationRepositoryContract } from "./synchronization-repository.contract";

describe("PostgreSQL SynchronizationRepository", () => {
  synchronizationRepositoryContract(async () => ({
    repository: createPostgresSynchronizationRepository(),
  }));
});
