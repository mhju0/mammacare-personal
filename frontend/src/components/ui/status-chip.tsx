import { type HTMLAttributes } from "react";
import { Check, Clock, AlertTriangle, AlertCircle, Circle, type LucideIcon } from "lucide-react";

import type { TestStatus } from "../../api/allergy";
import { cn } from "./utils";

export type ChipStatus = "safe" | "testing" | "reaction" | "caution" | "not-started";

const STATUS_CONFIG: Record<ChipStatus, { label: string; className: string; Icon: LucideIcon }> = {
  safe: { label: "안전", className: "bg-safe-bg text-safe-fg", Icon: Check },
  testing: { label: "테스트중", className: "bg-testing-bg text-testing-fg", Icon: Clock },
  reaction: { label: "반응", className: "bg-reaction-bg text-reaction-fg", Icon: AlertTriangle },
  caution: { label: "주의", className: "bg-caution-bg text-caution-fg", Icon: AlertCircle },
  "not-started": { label: "미시작", className: "bg-not-started-bg text-not-started-fg", Icon: Circle },
};

/**
 * Maps the API's `test_status` enum (and the `has_reaction` flag) onto a ChipStatus.
 * An in-progress test that already recorded a reaction is surfaced as "reaction".
 */
export function statusFromTestStatus(testStatus: TestStatus, hasReaction = false): ChipStatus {
  if (testStatus === "completed_safe") return "safe";
  if (testStatus === "completed_reaction" || hasReaction) return "reaction";
  return "testing";
}

interface StatusChipProps extends HTMLAttributes<HTMLSpanElement> {
  status: ChipStatus;
  /** Hide the text label (icon + aria-label still convey meaning). */
  showLabel?: boolean;
  /** Override the default status label, e.g. "Day 2". Also used as the aria-label. Omit to use the status default. */
  label?: string;
}

/**
 * Semantic status pill for allergy test states. Meaning is carried by icon + label,
 * not color alone (accessibility), and colors come from the design-system tokens.
 */
export function StatusChip({ status, showLabel = true, label, className, ...props }: StatusChipProps) {
  const { label: defaultLabel, className: statusClassName, Icon } = STATUS_CONFIG[status];
  const text = label ?? defaultLabel;

  return (
    <span
      data-slot="status-chip"
      role="status"
      aria-label={text}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        statusClassName,
        className,
      )}
      {...props}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {showLabel && <span>{text}</span>}
    </span>
  );
}
