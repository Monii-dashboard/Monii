import { AsyncLocalStorage } from "node:async_hooks";

import type { StartedPostgresTestDatabase } from "../postgres";

export type IntegrationResource<T> = Readonly<{
  dispose?: () => Promise<void> | void;
  value: T;
}>;

type IntegrationContext = {
  postgres: StartedPostgresTestDatabase;
  resources: Map<string, Promise<IntegrationResource<unknown>>>;
};

const integrationContext = new AsyncLocalStorage<IntegrationContext>();

export function runWithIntegrationContext<T>(
  context: IntegrationContext,
  callback: () => T,
): T {
  return integrationContext.run(context, callback);
}

export function getIntegrationContext(): IntegrationContext {
  const context = integrationContext.getStore();
  if (!context) {
    throw new Error(
      "Integration context is unavailable; declare the test with it from @testkit/integration.",
    );
  }
  return context;
}

export async function getOrCreateIntegrationResource<T>(
  key: string,
  create: () => Promise<IntegrationResource<T>> | IntegrationResource<T>,
): Promise<T> {
  const context = getIntegrationContext();
  let resource = context.resources.get(key) as
    | Promise<IntegrationResource<T>>
    | undefined;
  if (!resource) {
    resource = Promise.resolve(create());
    context.resources.set(key, resource);
  }
  return (await resource).value;
}

export async function disposeIntegrationResources(
  context: IntegrationContext,
): Promise<void> {
  const resources = [...context.resources.values()].reverse();
  for (const resource of resources) {
    await (await resource).dispose?.();
  }
}

export function createIntegrationContext(
  postgres: StartedPostgresTestDatabase,
): IntegrationContext {
  return { postgres, resources: new Map() };
}
