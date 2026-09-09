"use client";

import { useId, type ReactNode } from "react";

import { Icon, type IconName } from "../icon";

export type BannerType = "default" | "critical" | "caution";

export type BannerProps = {
  actions: ReactNode;
  description: ReactNode;
  onDismiss?: () => void;
  title: ReactNode;
  type?: BannerType;
};

const bannerType = {
  default: {
    iconName: "info",
    icon: "text-info-content",
    root: "border-info-outline bg-info-subtle text-info-content",
  },
  critical: {
    iconName: "critical",
    icon: "text-danger-content-strong",
    root: "border-danger-outline bg-danger-subtle text-danger-content-strong",
  },
  caution: {
    iconName: "caution",
    icon: "text-warning",
    root: "border-warning/25 bg-warning/5 text-content",
  },
} satisfies Record<
  BannerType,
  { icon: string; iconName: IconName; root: string }
>;

export function Banner({
  actions,
  description,
  onDismiss,
  title,
  type = "default",
}: BannerProps) {
  const titleId = useId();
  const descriptionId = useId();
  const { icon, iconName, root } = bannerType[type];

  return (
    <section
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      className={`relative flex min-h-16 items-start gap-4 rounded-control border px-5 py-4 ${onDismiss ? "pr-12" : ""} ${root}`}
    >
      <Icon className={`size-5 shrink-0 ${icon}`} name={iconName} />
      <div className="flex min-w-0 flex-1 items-center gap-6 max-[680px]:flex-col max-[680px]:items-stretch max-[680px]:gap-3">
        <div className="min-w-0 flex-1">
          <div
            className="font-mono text-body font-semibold tracking-label-wide uppercase"
            id={titleId}
          >
            {title}
          </div>
          <div
            className="mt-1 text-body-small leading-5 text-current opacity-75"
            id={descriptionId}
          >
            {description}
          </div>
        </div>
        <div className="shrink-0">{actions}</div>
      </div>
      {onDismiss ? (
        <button
          aria-label="Dismiss banner"
          className="absolute top-2 right-2 grid size-8 cursor-pointer place-items-center rounded-control border-0 bg-transparent text-current opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
          onClick={onDismiss}
          type="button"
        >
          <Icon className="size-4" name="close" />
        </button>
      ) : null}
    </section>
  );
}
