import * as React from "react";
import { cn } from "@/lib/utils";
import { AnimatedNumber } from "@/components/ui/animated-number";

/**
 * Hero stat tile — big number + label + optional trend pill.
 *
 * Used by the candidate dashboard greeting card (applications,
 * profile views, followers) and the employer dashboard (open
 * roles, applications this week, hires this quarter). One
 * primitive replaces the half-dozen one-off "big number + label"
 * implementations scattered across the codebase.
 */
interface StatTileProps {
  label: string;
  /// Numeric value the tile counts up to when it scrolls into view.
  value: number;
  /// Optional helper line shown beneath the label — useful for "+12 vs last week"
  /// or "across 6 open roles" annotations.
  hint?: React.ReactNode;
  /// Trend chip on the right — e.g. ▲ 12% / ▼ 4 / live counter.
  trend?: { tone: "up" | "down" | "neutral"; label: string };
  /// "soft" sits on white surfaces; "hero" sits on the dark mesh
  /// gradient (white text on dark background).
  variant?: "soft" | "hero";
  icon?: React.ReactNode;
  className?: string;
  /// Optional formatter for the numeric value (default: en-IN locale).
  formatter?: (n: number) => string;
  /// Optional suffix that renders next to the number — "%", "+", "k".
  suffix?: string;
}

const trendTone = {
  up: "text-emce-success-deep bg-emce-light-soft",
  down: "text-emce-red-deep bg-emce-red-light",
  neutral: "text-emce-text-sec bg-emce-light-soft",
};

export function StatTile({
  label,
  value,
  hint,
  trend,
  variant = "soft",
  icon,
  className,
  formatter,
  suffix,
}: StatTileProps) {
  const isHero = variant === "hero";
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg p-4 transition-all",
        isHero
          ? "bg-white/10 text-white ring-1 ring-white/15 backdrop-blur-md hover:bg-white/15"
          : "bg-white border border-emce-border shadow-emce hover:shadow-emce-hover",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-[11px] font-bold uppercase tracking-wider",
              isHero ? "text-white/70" : "text-emce-text-muted",
            )}
          >
            {label}
          </p>
          <p
            className={cn(
              "mt-1 font-extrabold leading-none",
              "text-3xl sm:text-4xl",
              isHero ? "text-white" : "text-emce-text",
            )}
          >
            <AnimatedNumber to={value} formatter={formatter} suffix={suffix} />
          </p>
          {hint && (
            <p
              className={cn(
                "mt-1.5 text-hint",
                isHero ? "text-white/65" : "text-emce-text-sec",
              )}
            >
              {hint}
            </p>
          )}
        </div>
        {icon && (
          <div
            className={cn(
              "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full",
              isHero ? "bg-white/15 text-white" : "bg-emce-light-soft text-emce-dark",
            )}
            aria-hidden
          >
            {icon}
          </div>
        )}
      </div>
      {trend && (
        <span
          className={cn(
            "mt-3 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
            isHero
              ? "bg-white/15 text-white"
              : trendTone[trend.tone],
          )}
        >
          {trend.tone === "up" && "▲"}
          {trend.tone === "down" && "▼"}
          {trend.label}
        </span>
      )}
    </div>
  );
}
