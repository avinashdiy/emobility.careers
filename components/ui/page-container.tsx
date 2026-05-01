import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Single source of truth for content max-width across the platform.
 *
 * Audit found pages using `max-w-3xl`, `4xl`, `5xl`, `6xl`, `7xl`,
 * `md`, and `2xl` ad-hoc — same user sees four different widths
 * across related features. PageContainer collapses that to four
 * intentional widths the rest of the codebase composes against:
 *
 *   • `narrow` — single-column reading (sign-in, settings, single
 *     forms). max-w-2xl ≈ 672px.
 *   • `default` — most app surfaces (profile, applications, fair
 *     landings). max-w-5xl ≈ 1024px.
 *   • `wide`   — dense data views (employer ATS, admin dashboards
 *     with side-by-side cards). max-w-6xl ≈ 1152px.
 *   • `full`   — the rare full-bleed surface (homepage marketing
 *     sections that already manage their own widths inside).
 *
 * Migration plan: pages currently using ad-hoc widths can switch
 * to <PageContainer width="..."> incrementally — both forms
 * coexist. Don't auto-replace; the ATS page legitimately wants
 * `max-w-7xl` for the kanban, which is fine — it just shouldn't
 * be the default for everything else.
 *
 * Defaults: `width="default"`, `padded` true (adds the standard
 * py-6/md:py-8 vertical rhythm). Pass `padded={false}` when the
 * caller manages spacing itself (typically marketing hero
 * sections that sit flush against the viewport edges).
 */
export interface PageContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: "narrow" | "default" | "wide" | "full";
  padded?: boolean;
}

const WIDTH_CLASS: Record<NonNullable<PageContainerProps["width"]>, string> = {
  narrow: "max-w-2xl",
  default: "max-w-5xl",
  wide: "max-w-6xl",
  full: "",
};

export const PageContainer = React.forwardRef<HTMLDivElement, PageContainerProps>(
  ({ width = "default", padded = true, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "container",
        WIDTH_CLASS[width],
        padded && "py-6 md:py-8",
        className,
      )}
      {...props}
    />
  ),
);
PageContainer.displayName = "PageContainer";
