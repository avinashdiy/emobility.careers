import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

export interface NativeSelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {}

export const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          "h-10 w-full appearance-none rounded-md border-[1.5px] border-emce-border bg-white px-3 pr-9 text-sm text-emce-text",
          "focus-visible:outline-none focus-visible:border-emce-mid focus-visible:ring-[3px] focus-visible:ring-emce-mid/15",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emce-text-muted" />
    </div>
  ),
);
NativeSelect.displayName = "NativeSelect";
