import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Divider } from ".";

const meta = {
  title: "Primitives/Divider",
  component: Divider,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Divider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Horizontal: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-4 text-body text-content-muted">
      <span>Cash accounts</span>
      <Divider />
      <span>Investment accounts</span>
    </div>
  ),
};

export const Vertical: Story = {
  render: () => (
    <div className="flex h-16 items-stretch gap-4 text-body text-content-muted">
      <span className="flex items-center">Included</span>
      <Divider />
      <span className="flex items-center">Excluded</span>
    </div>
  ),
};
