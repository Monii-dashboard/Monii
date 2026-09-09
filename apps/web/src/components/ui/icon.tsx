import type { ReactNode } from "react";

export type IconName =
  | "cash"
  | "caution"
  | "close"
  | "critical"
  | "info"
  | "investment"
  | "monii";

type IconProps = {
  className?: string;
  label?: string;
  name: IconName;
};

type IconDefinition = {
  content: ReactNode;
  viewBox?: string;
};

const icons: Record<IconName, IconDefinition> = {
  cash: {
    content: (
      <>
        <path
          d="M5 8.5h12.5a2 2 0 0 1 2 2v7H6.5a2 2 0 0 1-2-2V7a2.5 2.5 0 0 1 2.5-2.5h10"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.7"
        />
        <circle cx="16" cy="13" fill="currentColor" r="1" />
      </>
    ),
  },
  caution: {
    content: (
      <>
        <path
          d="M10.3 4.1 3.2 17a2 2 0 0 0 1.75 3h14.1a2 2 0 0 0 1.75-3L13.7 4.1a1.95 1.95 0 0 0-3.4 0Z"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="1.7"
        />
        <path
          d="M12 8v5m0 3.5v.1"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.7"
        />
      </>
    ),
  },
  close: {
    content: (
      <path
        d="m7 7 10 10M17 7 7 17"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.7"
      />
    ),
  },
  critical: {
    content: (
      <>
        <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.7" />
        <path
          d="M12 7.5v6m0 3v.1"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.7"
        />
      </>
    ),
  },
  info: {
    content: (
      <>
        <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.7" />
        <path
          d="M12 10.8v5m0-8.35v.1"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.7"
        />
      </>
    ),
  },
  investment: {
    content: (
      <>
        <path
          d="M5 18V9m7 9V5m7 13v-6M3.5 18.5h17"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.7"
        />
        <path
          d="m5 8 7-4 7 7"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.7"
        />
      </>
    ),
  },
  monii: {
    content: (
      <>
        <path
          d="M8 28V12l12 9 12-9v16"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3.25"
        />
        <circle cx="20" cy="21" fill="currentColor" r="3.2" />
      </>
    ),
    viewBox: "0 0 40 40",
  },
};

export function Icon({ className, label, name }: IconProps) {
  const icon = icons[name];

  return (
    <svg
      aria-hidden={label ? undefined : "true"}
      aria-label={label}
      className={className}
      fill="none"
      role={label ? "img" : undefined}
      viewBox={icon.viewBox ?? "0 0 24 24"}
    >
      {icon.content}
    </svg>
  );
}
