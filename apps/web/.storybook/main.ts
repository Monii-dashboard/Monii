import type { StorybookConfig } from "@storybook/nextjs-vite";

const config = {
  stories: ["../src/components/ui/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y"],
  framework: {
    name: "@storybook/nextjs-vite",
    options: {},
  },
  staticDirs: ["../public"],
  docs: {
    defaultName: "Documentation",
  },
} satisfies StorybookConfig;

export default config;
