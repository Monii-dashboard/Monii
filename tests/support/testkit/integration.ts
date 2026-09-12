import { runWithDatabase } from "@monii/postgres/client";
import {
  afterAll,
  afterEach,
  aroundAll,
  aroundEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  onTestFailed,
  onTestFinished,
  vi,
} from "vitest";

import { startPostgresTestDatabase } from "../postgres";
import {
  createIntegrationContext,
  disposeIntegrationResources,
  runWithIntegrationContext,
} from "./context";

aroundEach(async (runTest) => {
  const postgres = await startPostgresTestDatabase();
  const context = createIntegrationContext(postgres);
  try {
    await runWithIntegrationContext(context, () =>
      runWithDatabase(postgres.runtimeDb, runTest),
    );
  } finally {
    try {
      await disposeIntegrationResources(context);
    } finally {
      await postgres.stop();
    }
  }
});

export {
  afterAll,
  afterEach,
  aroundAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  onTestFailed,
  onTestFinished,
  vi,
};
