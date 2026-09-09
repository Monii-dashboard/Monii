import styles from "./signal.module.css";

type SignalBadgeProps = {
  index: number;
};

export function SignalBadge({ index }: SignalBadgeProps) {
  return (
    <span
      className={`${styles.badge} grid size-8 shrink-0 place-items-center rounded-full border border-current font-mono text-label-small font-semibold text-[var(--signal)]`}
    >
      {String(index + 1).padStart(2, "0")}
    </span>
  );
}
