import type { Database } from "@monii/postgres/client";

import { getIntegrationContext } from "./context";

export function getIntegrationDatabase(): Database {
  return getIntegrationContext().postgres.db;
}
