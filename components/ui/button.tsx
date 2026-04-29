import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        // Primary: dark teal background, lime text — matches plugin .emce-btn--primary
        default: "bg-emce-dark text-emce-light hover:bg-emce-dark-deep",
        // Accent: lime background, dark text — for hero CTAs
        accent: "bg-emce-light text-emce-darkest hover:bg-emce-mid hover:text-emce-darkest",
        // Outline secondary: dark teal border — matches .emce-btn--secondary
        outline:
          "border-2 border-emce-dark bg-transparent text-emce-dark hover:bg-emce-light-soft",
        // Ghost: subtle pill on light bg — matches .emce-btn--ghost
        ghost: "bg-emce-light-soft text-emce-dark hover:bg-emce-mid hover:text-emce-darkest",
        link: "text-emce-dark underline-offset-4 hover:underline",
        destructive:
          "bg-emce-red text-white hover:bg-emce-red/90",
      },
      size: {
        default: "h-10 px-5 py-2.5",
        sm: "h-8 rounded px-3 text-xs",
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
