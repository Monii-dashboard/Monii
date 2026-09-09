import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";

import { Button } from "../button";
import { Banner } from ".";

const meta = {
  title: "Primitives/Banner",
  component: Banner,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    actions: {
      control: false,
    },
    description: {
      control: "text",
    },
    onDismiss: {
      control: false,
    },
    title: {
      control: "text",
    },
    type: {
      control: "select",
      options: ["default", "critical", "caution"],
    },
  },
  args: {
    actions: <Button type="secondary">Review</Button>,
    description: "Your latest account data remains available while Monii reconnects.",
    title: "Connection needs attention",
    type: "default",
  },
  render: (args) => (
    <div className="w-[min(48rem,calc(100vw-4rem))]">
      <Banner {...args} />
    </div>
  ),
} satisfies Meta<typeof Banner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Critical: Story = {
  args: {
    type: "critical",
  },
};

export const Caution: Story = {
  args: {
    type: "caution",
  },
};

export const Dismissible: Story = {
  args: {
    onDismiss: fn(),
  },
};
