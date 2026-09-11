import { fileURLToPath } from "node:url";

import { configDefaults, defineConfig } from "vitest/config";

const applicationExcludes = [
  ...configDefaults.exclude,
  "specific_examples/**",
];

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@testkit\/apps\/([^/]+)$/,
        replacement: fileURLToPath(
          new URL("./apps/$1/test-support/index.ts", import.meta.url),
        ),
      },
      {
        find: /^@testkit\/packages\/([^/]+)$/,
        replacement: fileURLToPath(
          new URL("./packages/$1/test-support/index.ts", import.meta.url),
        ),
      },
      {
        find: /^@testkit\/(.+)$/,
        replacement: fileURLToPath(
          new URL("./tests/support/testkit/$1.ts", import.meta.url),
        ),
      },
      {
        find: /^@\/(.+)$/,
        replacement: fileURLToPath(
          new URL("./apps/web/src/$1", import.meta.url),
        ),
      },
    ],
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "repository",
          include: ["tests/repository/**/*.test.mjs"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "unit",
          include: ["**/*.test.{ts,tsx}"],
          exclude: [
            ...applicationExcludes,
            "**/*.integration.test.{ts,tsx}",
            "tests/repository/**",
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["**/*.integration.test.{ts,tsx}"],
          exclude: applicationExcludes,
          environment: "node",
          hookTimeout: 120_000,
          testTimeout: 30_000,
        },
      },
    ],
  },
});
