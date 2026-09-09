import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Spinner } from ".";

const meta = {
  title: "Primitives/Spinner",
  component: Spinner,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    size: {
      control: "select",
      options: ["small", "medium", "large"],
    },
  },
  args: {
    size: "medium",
  },
} satisfies Meta<typeof Spinner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AccessibleStatus: Story = {
  args: {
    label: "Loading account data",
  },
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-8 text-content">
      <Spinner size="small" />
      <Spinner size="medium" />
      <Spinner size="large" />
    </div>
  ),
};
