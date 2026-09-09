import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Icon, type IconName } from ".";

const iconNames: IconName[] = [
  "cash",
  "caution",
  "close",
  "critical",
  "info",
  "investment",
  "monii",
];

const meta = {
  title: "Primitives/Icon",
  component: Icon,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    name: {
      control: "select",
      options: iconNames,
    },
  },
  args: {
    className: "size-8",
    name: "monii",
  },
} satisfies Meta<typeof Icon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Labelled: Story = {
  args: {
    label: "Information",
    name: "info",
  },
};

export const Gallery: Story = {
  render: () => (
    <div className="grid grid-cols-4 gap-6">
      {iconNames.map((name) => (
        <div
          className="flex min-w-24 flex-col items-center gap-2 text-content-muted"
          key={name}
        >
          <Icon className="size-8 text-content" name={name} />
          <span className="font-mono text-label-small">{name}</span>
        </div>
      ))}
    </div>
  ),
};
