import { cn } from "@/lib/utils";

/**
 * Tiny absolutely-positioned sparkle accent. Drop next to a verified
 * badge, a fresh-application chip, or any "this is new / this is
 * special" affordance. Pure CSS — no JS — so it's safe inside server
 * components.
 *
 * Pass `position` for the absolute anchor relative to the parent's
 * `position: relative` container. Default top-right.
 */
interface SparkleProps {
  className?: string;
  /// Pixel size of the sparkle SVG. Default 12. Keep small — it's an
  /// accent, not a feature.
  size?: number;
  /// Animation delay so a row of sparkles doesn't pulse in lock-step.
  delayMs?: number;
}

export function Sparkle({ className, size = 12, delayMs = 0 }: SparkleProps) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={cn("pointer-events-none animate-sparkle text-emce-mid", className)}
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <path
        fill="currentColor"
        d="M12 2l1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6z"
      />
    </svg>
  );
}
