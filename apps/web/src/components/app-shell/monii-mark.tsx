import type { SVGProps } from "react";

export function MoniiMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 40 40" {...props}>
      <path
        d="M8 28V12l12 9 12-9v16"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3.25"
      />
      <circle cx="20" cy="21" fill="currentColor" r="3.2" />
    </svg>
  );
}
