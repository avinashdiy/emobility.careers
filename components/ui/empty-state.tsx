import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  body?: string;
  action?: React.ReactNode;
  className?: string;
  /**
   * Visual treatment. Default "soft" is the old quiet card (used for
   * inline empties like a profile section). "mesh" gets the animated
   * soft mesh gradient for hero-level empties (a candidate's first
   * /me/applications visit, an empty /jobs search result).
   */
  variant?: "soft" | "mesh";
}

/**
 * Standard empty-state card. Use when a list / collection has zero
 * items so we render a consistent voice across the app instead of
 * one-off "no results" blurbs.
 *
 * The icon prop accepts an emoji string OR a React node, so callers
 * can drop in `"🔎"`, `<Plug className="h-8 w-8" />`, or a full
 * illustration. We bump emoji icons to text-5xl (was 4xl) and float
 * them so the empty state feels like a moment, not a placeholder.
 *
 * Vibe pass: added `mesh` variant + animated entry. The mesh option
 * promotes "you haven't done X yet" from a sad-empty-list moment to
 * something that reads as "ready when you are".
 */
export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
  variant = "soft",
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border p-10 text-center animate-fade-up",
        variant === "soft" && "border-dashed border-emce-border bg-white",
        variant === "mesh" && "emce-mesh-soft border-emce-mid/30",
        className,
      )}
    >
      {/* Decorative dot grid behind the icon — only shows on the mesh
          variant where the soft gradient gives it enough contrast. */}
      {variant === "mesh" && (
        <div
          aria-hidden
          className="emce-dot-grid pointer-events-none absolute inset-0 opacity-40"
        />
      )}
      <div className="relative">
        {icon && (
          <div className="mx-auto inline-flex animate-float text-5xl">
            {icon}
          </div>
        )}
        <p className="mt-3 text-section font-bold text-emce-text">{title}</p>
        {body && (
          <p className="mx-auto mt-1 max-w-md text-sm text-emce-text-sec">{body}</p>
        )}
        {action && <div className="mt-4 flex justify-center">{action}</div>}
      </div>
    </div>
  );
}
