"use client";

import { cn } from "@/lib/utils";

/**
 * Sticky selection bar — the visual treatment shared by every bulk-
 * action surface (talent search, ATS pipeline, AI matches, future
 * cohort/admin pages). Two presentations:
 *
 *   - "floating" (default) — pill that floats centred at the bottom of
 *     the viewport. Good for one-off selection bursts where the action
 *     is the next click. Used on talent search.
 *   - "sticky"   — full-width strip that sticks below the page header.
 *     Good for high-frequency bulk operations like ATS where the
 *     recruiter is reaching for the same drop-down repeatedly.
 *
 * Children get the right slots: the count + clear button render on the
 * left, the action slot on the right. Callers don't need to repeat the
 * selection-count or clear-button markup.
 */

export function SelectionBar({
  count,
  onClear,
  variant = "floating",
  children,
  className,
}: {
  count: number;
  onClear: () => void;
  variant?: "floating" | "sticky";
  /** Action buttons / dropdowns rendered on the right. */
  children?: React.ReactNode;
  className?: string;
}) {
  if (count === 0) return null;

  const wrap =
    variant === "floating"
      ? "fixed bottom-4 left-1/2 z-40 max-w-[calc(100vw-2rem)] -translate-x-1/2"
      : "sticky top-2 z-10 mb-3";

  const inner =
    variant === "floating"
      ? "flex flex-wrap items-center gap-2 rounded-full border border-emce-border bg-white px-4 py-2 shadow-emce-lg"
      : "flex flex-wrap items-center gap-2 rounded-lg border border-emce-mid bg-emce-light-soft p-3 sm:gap-3";

  return (
    <div className={cn(wrap, className)}>
      <div className={inner}>
        <span className="text-sm font-bold text-emce-text">
          {count} selected
        </span>
        <button
          type="button"
          onClick={onClear}
          className="text-xs font-bold text-emce-text-sec hover:text-emce-text"
        >
          Clear
        </button>
        {children && (
          <>
            <span className="hidden h-4 w-px bg-emce-border sm:block" />
            {children}
          </>
        )}
      </div>
    </div>
  );
}
