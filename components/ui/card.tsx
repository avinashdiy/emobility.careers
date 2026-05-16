import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Card variants for the vibe-pass refresh:
 *
 *  - `default` (no prop) — the existing low-key Card. Used everywhere
 *    we want a content surface that quietly hosts text or controls.
 *  - `interactive` — adds cursor + hover-lift + brighter ring. Pair
 *    with `<Link>` or onClick for clickable cards (job tiles, mentor
 *    cards, candidate result rows).
 *  - `glow` — premium gradient border + soft sheen. Reserve for the
 *    1–2 highlight cards on a page: featured job, top match, verified
 *    profile callout. Over-using flattens the signal back to noise.
 *
 * `animate` toggles a one-shot `fade-up` entry — handy on hero
 *  surfaces. Lists of cards should usually use `emce-stagger` on the
 *  parent instead so children sequence automatically.
 */
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "interactive" | "glow";
  animate?: boolean;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = "default", animate, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        // LinkedIn-density default: 16px padding (p-4) instead of 24px.
        // Pages that genuinely need more breathing room (auth forms,
        // modal-like containers) override with `p-5` / `p-6` / `p-8`.
        variant === "default" &&
          "rounded-lg border border-emce-border bg-white p-4 shadow-emce dark:border-border dark:bg-card dark:text-card-foreground dark:shadow-none",
        variant === "interactive" && "emce-card-interactive",
        variant === "glow" && "emce-card-glow p-4",
        animate && "animate-fade-up",
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 pb-3", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn("text-section font-bold text-emce-text dark:text-foreground", className)}
      {...props}
    />
  ),
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-hint text-emce-text-sec dark:text-muted-foreground", className)} {...props} />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("text-body", className)} {...props} />
  ),
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center pt-4", className)} {...props} />
  ),
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
