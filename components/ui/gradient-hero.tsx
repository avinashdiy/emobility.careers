import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Animated mesh-gradient hero panel. Use as the top-of-page banner on
 * dashboards, marketing landing, employer onboarding, and the
 * /campus/[slug] / /events/[slug] landing pages. The visual goal is
 * a quiet warmth that signals "this is a place, not a form".
 *
 * The mesh comes from `bg-emce-mesh` paired with
 * `animate-emce-mesh` (background-position cycles every 18s). The
 * inner content sits in `relative z-10` so foreground type stays
 * above the moving surface. Reduced-motion users get a static
 * gradient (animation is paused via media query in globals.css).
 *
 * Children are typically:
 *   • a small eyebrow line (Badge / "Welcome back")
 *   • a hero heading
 *   • a short subtitle
 *   • an action row (CTA + secondary CTA)
 * The component is *not* opinionated about that layout — just supplies
 * the surface + decorative dot grid + a couple of floating orbs.
 */
interface GradientHeroProps extends React.HTMLAttributes<HTMLDivElement> {
  /// Adds a faint dot-grid behind the mesh for extra texture. Default true.
  dots?: boolean;
  /// Adds two soft floating orbs that drift slowly on opposite corners.
  /// Default true for desktop, but they're auto-hidden under 640px so
  /// they don't compete with content on phones.
  orbs?: boolean;
  /// Vertical density — default "comfortable" (py-10/py-14). "compact"
  /// for in-card heroes; "spacious" for marketing landing.
  size?: "compact" | "comfortable" | "spacious";
}

const sizeMap = {
  compact: "py-6 sm:py-8",
  comfortable: "py-10 sm:py-14",
  spacious: "py-16 sm:py-24",
};

export function GradientHero({
  children,
  className,
  dots = true,
  orbs = true,
  size = "comfortable",
  ...props
}: GradientHeroProps) {
  return (
    <div
      className={cn(
        "emce-mesh-hero relative",
        sizeMap[size],
        "px-5 sm:px-8 md:px-10",
        className,
      )}
      {...props}
    >
      {dots && (
        <div
          aria-hidden
          className="emce-dot-grid pointer-events-none absolute inset-0 opacity-25"
        />
      )}
      {orbs && (
        <>
          <span
            aria-hidden
            className="pointer-events-none absolute -left-10 top-6 hidden h-32 w-32 rounded-full bg-emce-mid/30 blur-3xl animate-float sm:block"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute -right-8 -top-4 hidden h-40 w-40 rounded-full bg-emce-light/25 blur-3xl animate-float sm:block"
            style={{ animationDelay: "1.6s" }}
          />
        </>
      )}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
