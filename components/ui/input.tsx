import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        "flex h-10 w-full rounded-md border-[1.5px] border-emce-border bg-white px-3 py-2 text-sm text-emce-text placeholder:text-emce-text-muted",
        "focus-visible:outline-none focus-visible:border-emce-mid focus-visible:ring-[3px] focus-visible:ring-emce-mid/15",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
