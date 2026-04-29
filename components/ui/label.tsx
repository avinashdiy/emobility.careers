import * as React from "react";
import { cn } from "@/lib/utils";

export const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn(
      "mb-1 block text-xs font-bold uppercase tracking-wide text-emce-text-sec",
      className,
    )}
    {...props}
  />
));
Label.displayName = "Label";
