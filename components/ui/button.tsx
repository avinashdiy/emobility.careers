import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Button variants. Vibe pass added:
 *   • `emce-press` (active:scale-[0.97]) on every variant so every
 *     button has a tactile feedback the previous flat hover lacked.
 *   • `glow` — premium CTA with soft outer glow + lime gradient. Use
 *     for the "Apply now", "Post a job", "Start onboarding" hero CTAs
 *     where we want the click to feel rewarding. Don't pepper into
 *     in-card actions; the glow is meant to be scarce.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 emce-press",
  {
    variants: {
      variant: {
        // Primary: dark teal background, lime text — matches plugin .emce-btn--primary
        // Inverted under dark theme: the green button reads as the
        // foreground call-to-action, with darkest text on it.
        default:
          "bg-emce-dark text-emce-light hover:bg-emce-dark-deep",
        // Accent: lime background, dark text — for hero CTAs. Already
        // high-contrast in both themes; only nudge hover so the green
        // doesn't blow out against the dark surface.
        accent:
          "bg-emce-light text-emce-darkest hover:bg-emce-mid hover:text-emce-darkest",
        // Outline secondary: dark teal border — matches .emce-btn--secondary.
        // In dark mode the green border/text reads better than the dark-teal.
        outline:
          "border-2 border-emce-dark bg-transparent text-emce-dark hover:bg-emce-light-soft",
        // Ghost: subtle pill on light bg — matches .emce-btn--ghost
        ghost:
          "bg-emce-light-soft text-emce-dark hover:bg-emce-mid hover:text-emce-darkest",
        link: "text-emce-dark underline-offset-4 hover:underline",
        destructive:
          "bg-emce-red text-white hover:bg-emce-red/90",
        // Glow (renamed in intent, kept the name to avoid touching
        // every call site): the platform's primary call-to-action.
        // Pre-redesign this was a 3-stop lime gradient with a
        // double-layer rest-state halo + hover brightness boost —
        // which read as "retail banner CTA" rather than "professional
        // platform". Now it's a clean lime solid with a soft hover
        // lift only. Same brand colour, same visual weight, none of
        // the gradient noise. `emce-press` handles the press feedback;
        // hover gets a subtle ring + 1px translate for tactility.
        glow:
          "bg-emce-light text-emce-darkest border border-emce-mid/40 hover:bg-emce-mid hover:-translate-y-px hover:shadow-emce",
      },
      size: {
        default: "h-10 px-5 py-2.5",
        // 36px tall — closer to Apple's 44px touch target than the
        // older 32px while still reading as a "small" button. Used
        // densely on admin moderation rows and job cards.
        sm: "h-9 rounded px-3 text-xs",
        lg: "h-12 rounded-md px-7 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
