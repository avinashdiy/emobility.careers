import * as React from "react";
import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-[88px] w-full rounded-md border-[1.5px] border-emce-border bg-white px-3 py-2 text-sm text-emce-text placeholder:text-emce-text-muted",
      "focus-visible:outline-none focus-visible:border-emce-mid focus-visible:ring-[3px] focus-visible:ring-emce-mid/15",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
