import { fileURLToPath } from "node:url";

import { configDefaults, defineConfig } from "vitest/config";

const applicationExcludes = [
  ...configDefaults.exclude,
  "specific_examples/**",
];

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["**/*.test.{ts,tsx}"],
          exclude: [
            ...applicationExcludes,
            "**/*.integration.test.{ts,tsx}",
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
