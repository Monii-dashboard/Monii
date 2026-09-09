"use client";

import Link from "next/link";
import {
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

import { Spinner } from "../spinner";

type ButtonSize = "small" | "medium" | "large";
type ButtonType = "primary" | "secondary" | "destructive";
type ButtonBehavior = "submit" | "reset";

type ButtonSharedProps = {
  autoFocus?: boolean;
  children: ReactNode;
  disabled?: boolean;
  onPress?: () => void;
  onPressChange?: (isPressed: boolean) => void;
  onPressEnd?: () => void;
  onPressStart?: () => void;
  onPressUp?: () => void;
  pending?: boolean;
  size?: ButtonSize;
  type: ButtonType;
};

export type ButtonProps = ButtonSharedProps &
  (
    | {
        behavior?: ButtonBehavior;
        form?: string;
        href?: never;
      }
    | {
        behavior?: never;
        form?: never;
        href: string;
      }
  );

const sizeClassName = {
  small: "min-h-8 px-3 py-1.5 text-label-small",
  medium: "min-h-10 px-4 py-2 text-body-small",
  large: "min-h-12 px-5 py-3 text-body",
} satisfies Record<ButtonSize, string>;

const typeClassName = {
  destructive:
    "border-danger bg-danger text-content hover:bg-danger-content focus-visible:outline-danger",
  primary:
    "border-accent bg-accent text-content-on-accent hover:bg-accent-hover focus-visible:outline-accent",
  secondary:
    "border-border-strong bg-surface-strong text-content hover:bg-surface-faint focus-visible:outline-accent",
} satisfies Record<ButtonType, string>;

type PressLifecycleOptions = Pick<
  ButtonSharedProps,
  | "onPress"
  | "onPressChange"
  | "onPressEnd"
  | "onPressStart"
  | "onPressUp"
> & {
  isLink: boolean;
  unavailable: boolean;
};

function usePressLifecycle({
  isLink,
  onPress,
  onPressChange,
  onPressEnd,
  onPressStart,
  onPressUp,
  unavailable,
}: PressLifecycleOptions) {
  const isPressed = useRef(false);

  function startPress() {
    if (unavailable || isPressed.current) return;
    isPressed.current = true;
    onPressStart?.();
    onPressChange?.(true);
  }

  function endPress() {
    if (!isPressed.current) return;
    isPressed.current = false;
    onPressEnd?.();
    onPressChange?.(false);
  }

  function isActivationKey(key: string) {
    return key === "Enter" || (!isLink && key === " ");
  }

  return {
    onBlur: () => endPress(),
    onClick: (event: MouseEvent<HTMLElement>) => {
      if (unavailable) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      onPress?.();
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (!isActivationKey(event.key) || event.repeat) return;
      if (unavailable) {
        event.preventDefault();
        return;
      }
      startPress();
    },
    onKeyUp: (event: KeyboardEvent<HTMLElement>) => {
      if (!isActivationKey(event.key)) return;
      endPress();
      if (!unavailable) onPressUp?.();
    },
    onPointerCancel: () => endPress(),
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      startPress();
    },
    onPointerLeave: () => endPress(),
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      endPress();
      if (!unavailable) onPressUp?.();
    },
  };
}

export function Button({
  autoFocus,
  behavior,
  children,
  disabled = false,
  form,
  href,
  onPress,
  onPressChange,
  onPressEnd,
  onPressStart,
  onPressUp,
  pending = false,
  size = "medium",
  type,
}: ButtonProps) {
  const unavailable = disabled || pending;
  const isLink = href !== undefined;
  const pressHandlers = usePressLifecycle({
    isLink,
    onPress,
    onPressChange,
    onPressEnd,
    onPressStart,
    onPressUp,
    unavailable,
  });
  const className = `inline-flex cursor-pointer items-center justify-center gap-2 rounded-control border font-mono font-semibold tracking-label no-underline uppercase transition-[background-color,border-color,color,opacity,transform] active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-45 aria-disabled:cursor-not-allowed aria-disabled:opacity-45 ${pending ? "cursor-wait opacity-65 disabled:cursor-wait aria-disabled:cursor-wait" : ""} ${sizeClassName[size]} ${typeClassName[type]}`;
  const content = (
    <>
      {pending ? (
        <Spinner size={size} />
      ) : null}
      {children}
    </>
  );

  if (href !== undefined) {
    return (
      <Link
        {...pressHandlers}
        aria-busy={pending || undefined}
        aria-disabled={unavailable || undefined}
        autoFocus={unavailable ? undefined : autoFocus}
        className={className}
        href={href}
        tabIndex={unavailable ? -1 : undefined}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      {...pressHandlers}
      aria-busy={pending || undefined}
      autoFocus={autoFocus}
      className={className}
      disabled={unavailable}
      form={form}
      type={behavior ?? "button"}
    >
      {content}
    </button>
  );
}
