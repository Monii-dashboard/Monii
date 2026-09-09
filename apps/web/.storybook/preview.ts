import type { Preview } from "@storybook/nextjs-vite";

import "../src/app/globals.css";
import "./preview.css";

const preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    layout: "centered",
  },
} satisfies Preview;

export default preview;
