export type SpinnerSize = "small" | "medium" | "large";

export type SpinnerProps = {
  label?: string;
  size?: SpinnerSize;
};

const sizeClassName = {
  small: "size-3.5",
  medium: "size-4",
  large: "size-5",
} satisfies Record<SpinnerSize, string>;

export function Spinner({ label, size = "medium" }: SpinnerProps) {
  return (
    <span
      aria-hidden={label ? undefined : "true"}
      aria-label={label}
      className={`inline-block shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent ${sizeClassName[size]}`}
      role={label ? "status" : undefined}
    />
  );
}
