import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

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
        danger: "bg-emce-red-light text-emce-red",
        outline: "border border-emce-border text-emce-text-sec",
        verified:
          "bg-gradient-to-r from-emce-verified-bg to-emce-light-soft text-emce-verified-text border border-emce-verified-border",
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

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, size }), className)} {...props} />;
}

export { Badge, badgeVariants };
