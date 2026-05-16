import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Badge variants. Vibe pass added:
 *   • `diyguru` — branded gradient pill for DIYguru-verified candidates.
 *     Distinct hue from `verified` so the two badges stay legible when
 *     they appear side-by-side on a profile.
 *   • `live` — pulsing-dot badge for things happening NOW (open
 *     applications, drives that started today, candidates active in
 *     the last 15 min). The dot uses `animate-ping-soft` so it reads
 *     as ambient motion, not strobe.
 *   • `glow` — gradient + soft halo for "premium / top match" tags.
 */
const badgeVariants = cva(
  "inline-flex items-center rounded-full font-bold uppercase tracking-wide",
  {
    variants: {
      variant: {
        default: "bg-emce-light-soft text-emce-dark",
        // Migrated from inline hex (#1e5a32) to the named token
        // `emce-success-deep` so design tweaks happen in one place.
        success: "bg-emce-light-soft text-emce-success-deep",
        warning: "bg-emce-orange-light text-emce-orange-deep",
        danger: "bg-emce-red-light text-emce-red-deep",
        outline: "border border-emce-border text-emce-text-sec",
        verified:
          "bg-gradient-to-r from-emce-verified-bg to-emce-light-soft text-emce-verified-text border border-emce-verified-border",
        diyguru:
          "bg-gradient-to-r from-emce-orange-light to-emce-orange/40 text-emce-orange-deep border border-emce-orange/50",
        live:
          "bg-white text-emce-success-deep border border-emce-mid/40 gap-1.5",
        // Glow — toned down to match the cleaned-up button glow.
        // Same intent ("premium / top-tier signal") delivered with a
        // clean solid + a soft border instead of a 3-stop gradient
        // with shadow. The verified + diyguru variants above keep
        // their subtler 2-stop gradients because those serve as
        // status-pill decoration, not the loud "🔥 highlight" role.
        glow:
          "bg-emce-light text-emce-darkest border border-emce-mid/50",
      },
      size: {
        // Standard pill — used on profile cards, list rows, anywhere
        // the badge is the primary attention-grab.
        default: "px-3 py-0.5 text-badge",
        // Compact pill — closer to LinkedIn's job-card chip density.
        // Use when several badges sit side-by-side inside a content
        // card and the default size would dominate the layout.
        sm: "px-2 py-0.5 text-[10px]",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, size }), className)} {...props}>
      {/* `live` variant ships with an integrated ping-soft dot so callers
          don't have to remember to add the markup. The dot uses a stacked
          element so the inner core stays solid while the outer ring pulses
          outward. */}
      {variant === "live" && (
        <span className="relative inline-flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full rounded-full bg-emce-mid animate-ping-soft" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emce-mid-muted" />
        </span>
      )}
      {children}
    </span>
  );
}

export { Badge, badgeVariants };
