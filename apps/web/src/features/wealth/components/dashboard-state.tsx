import type { ReactNode } from "react";

import { BrandMark } from "@/components/app-shell/app-shell";

import styles from "./dashboard-state.module.css";

function StateShell({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${styles.shell} flex min-h-screen flex-col items-start justify-center bg-canvas p-[8vw] font-sans text-content`}
    >
      <BrandMark />
      {children}
    </div>
  );
}

export function DashboardLoading() {
  return (
    <StateShell>
      <div className={styles.loadingLens}>
        <i />
        <i />
      </div>
      <span className="mt-10 font-mono text-label font-semibold tracking-label-wide text-content-muted uppercase">
        Opening wealth workspace
      </span>
    </StateShell>
  );
}

export function DashboardError({ retry }: { retry: () => void }) {
  return (
    <StateShell>
      <span className="mt-10 font-mono text-label font-semibold tracking-label-wide text-content-muted uppercase">
        Dashboard read interrupted
      </span>
      <h1 className="my-5 max-w-200 text-[clamp(3rem,7vw,6rem)] leading-[0.9] tracking-[-0.08em]">
        The latest wealth snapshot is unavailable.
      </h1>
      <p className="text-body text-content-muted">
        Stored financial data is untouched.
      </p>
      <button
        className="mt-4 min-h-11 cursor-pointer rounded-control border-0 bg-accent px-4 py-3 text-body font-bold text-content-on-accent transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-accent"
        onClick={retry}
        type="button"
      >
        Try again
      </button>
    </StateShell>
  );
}
