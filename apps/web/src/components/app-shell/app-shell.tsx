import type { ReactNode } from "react";

import { Icon } from "@/components/ui/icon";

import styles from "./app-shell.module.css";

type AppShellProps = {
  children: ReactNode;
  id?: string;
  sectionLabel: string;
  status: {
    healthy: boolean;
    label: string;
  };
};

const navigationItemClassName =
  "grid size-11 place-items-center rounded-[0.8rem] border border-transparent bg-transparent font-mono text-label-small font-semibold text-content-muted no-underline";

export function BrandMark() {
  return (
    <span
      aria-label="Monii"
      className="grid size-10 place-items-center rounded-control bg-accent text-content-on-accent shadow-brand"
    >
      <Icon className="size-6" name="monii" />
    </span>
  );
}

function AppRail() {
  return (
    <aside className="sticky top-0 z-30 flex h-screen flex-col items-center self-start border-r border-border-default bg-canvas/90 py-6 backdrop-blur-[var(--theme-blur-chrome)] max-[680px]:h-16 max-[680px]:flex-row max-[680px]:border-r-0 max-[680px]:border-b max-[680px]:px-4 max-[680px]:py-0">
      <BrandMark />
      <nav
        aria-label="Primary"
        className="my-auto flex flex-col gap-3 max-[680px]:my-0 max-[680px]:ml-auto max-[680px]:flex-row"
      >
        <button
          aria-label="Home — coming later"
          className={`${navigationItemClassName} max-[680px]:hidden`}
          disabled
          type="button"
        >
          H
        </button>
        <a
          aria-current="page"
          aria-label="Wealth"
          className={`${navigationItemClassName} ${styles.activeNavigation} focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-accent`}
          href="#dashboard"
        >
          W
        </a>
        <button
          aria-label="Accounts — coming later"
          className={`${navigationItemClassName} max-[680px]:hidden`}
          disabled
          type="button"
        >
          A
        </button>
        <button
          aria-label="Activity — coming later"
          className={`${navigationItemClassName} max-[680px]:hidden`}
          disabled
          type="button"
        >
          T
        </button>
      </nav>
      <span className="grid size-9 place-items-center rounded-full border border-border-default bg-surface-strong font-mono text-label-small font-semibold text-content max-[680px]:hidden">
        AP
      </span>
    </aside>
  );
}

export function AppShell({
  children,
  id,
  sectionLabel,
  status,
}: AppShellProps) {
  return (
    <div
      className={`${styles.atmosphere} relative grid min-h-screen grid-cols-[5.4rem_minmax(0,1fr)] overflow-clip bg-canvas font-sans text-content max-[680px]:block`}
      id={id}
    >
      <AppRail />
      <div className="relative z-1 min-w-0">
        <header className="flex h-20 items-center justify-between border-b border-border-default bg-canvas/50 px-10 backdrop-blur-2xl max-[680px]:hidden">
          <span className="font-mono text-label font-medium tracking-label-wide text-content-muted uppercase">
            Personal workspace <i className="mx-2 not-italic opacity-55">/</i>{" "}
            {sectionLabel}
          </span>
          <span
            className={`flex items-center gap-2 whitespace-nowrap font-mono text-label font-semibold tracking-label uppercase ${status.healthy ? "text-highlight" : "text-danger-content"}`}
          >
            <i
              className={`${styles.statusDot} size-1.5 rounded-full bg-current`}
            />
            {status.label}
          </span>
        </header>
        {children}
      </div>
    </div>
  );
}
