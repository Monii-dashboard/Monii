import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";

import { Button } from ".";

const meta = {
  title: "Primitives/Button",
  component: Button,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    size: {
      control: "select",
      options: ["small", "medium", "large"],
    },
    type: {
      control: "select",
      options: ["primary", "secondary", "destructive"],
    },
  },
  args: {
    children: "Continue",
    onPress: fn(),
    size: "medium",
    type: "primary",
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {};

export const Secondary: Story = {
  args: {
    type: "secondary",
  },
};

export const Destructive: Story = {
  args: {
    children: "Remove account",
    type: "destructive",
  },
};

export const Small: Story = {
  args: {
    size: "small",
  },
};

export const Large: Story = {
  args: {
    size: "large",
  },
};

export const Pending: Story = {
  args: {
    children: "Saving",
    pending: true,
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};

export const Link: Story = {
  args: {
    children: "View accounts",
    href: "/accounts",
    type: "secondary",
  },
};
