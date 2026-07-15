import { type ReactNode } from "react";

import { cn } from "./utils";

// ── warm-kr ProgressRing (S0 definition; NOT yet adopted by any screen). ──
// Pure SVG circular progress — no new dependencies. Status-agnostic: the ring
// knows nothing about safe/testing/reaction. The caller injects the semantic
// colour at call time (e.g. testing amber on the Observe 72h screen).

interface ProgressRingProps {
  /** Completion percentage, 0–100. Values outside the range are clamped. */
  value: number;
  /** Outer diameter of the ring in pixels. */
  size?: number;
  /** Thickness of the ring stroke in pixels. */
  strokeWidth?: number;
  /**
   * Colour of the progress arc. Accepts any CSS colour value — a design token
   * (`"var(--warm-cta)"`, the default), a hex, or `"currentColor"` to inherit
   * from a `text-*` utility set via `className`. Inject the semantic colour
   * here, e.g. testing amber `"var(--testing-fg)"` on the Observe screen.
   */
  color?: string;
  /** Colour of the unfilled track behind the arc. Same value rules as `color`. */
  trackColor?: string;
  /** Centred content (percentage text, a "Day 2" label, an icon…). Caller-owned. */
  children?: ReactNode;
  /** Applied to the wrapper — use for layout or a `text-*` utility feeding `currentColor`. */
  className?: string;
  /** Accessible label for the progress value (e.g. "관찰 진행률"). */
  "aria-label"?: string;
}

/**
 * Circular progress indicator drawn with two SVG circles (track + arc) via
 * `stroke-dasharray`/`stroke-dashoffset`. The arc starts at 12 o'clock and
 * fills clockwise. `children` render centred on top of the ring.
 */
export function ProgressRing({
  value,
  size = 120,
  strokeWidth = 10,
  color = "var(--warm-cta)",
  trackColor = "var(--warm-surface-soft)",
  children,
  className,
  "aria-label": ariaLabel,
}: ProgressRingProps) {
  const clamped = Math.min(100, Math.max(0, value));
  const center = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clamped / 100);

  return (
    <div
      data-slot="progress-ring"
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel}
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      {/* Rotate -90° so the arc starts at the top instead of 3 o'clock. */}
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          style={{ stroke: trackColor }}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className="transition-[stroke-dashoffset] duration-500 ease-out"
          style={{ stroke: color }}
        />
      </svg>
      {children != null && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          {children}
        </div>
      )}
    </div>
  );
}
