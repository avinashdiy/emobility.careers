"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

/**
 * Lightweight tooltip primitive for icon-only buttons + truncated
 * labels. Uses Radix under the hood so we get keyboard
 * (focus-triggers-tooltip), touch (ignored — no hover on mobile,
 * which is correct), and ARIA wiring for free.
 *
 * IMPORTANT: tooltips are not a substitute for accessible labels.
 * Icon-only buttons must STILL carry an `aria-label` — the
 * tooltip is sighted-user UI, the aria-label is for screen
 * readers. The pattern:
 *
 *   <Tooltip content="Edit profile">
 *     <button aria-label="Edit profile">
 *       <Pencil className="h-4 w-4" aria-hidden />
 *     </button>
 *   </Tooltip>
 *
 * The wrapping <TooltipProvider> is mounted once at the root
 * layout (see app/layout.tsx); individual <Tooltip> uses just
 * compose Trigger + Content.
 *
 * Default delay 200ms — fast enough that hovering over an icon
 * row doesn't feel laggy, slow enough that a passing mouse
 * doesn't trigger every tooltip in a list.
 */

const TooltipProvider = TooltipPrimitive.Provider;
const TooltipRoot = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;
const TooltipPortal = TooltipPrimitive.Portal;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      "z-50 max-w-xs rounded-md bg-emce-darkest px-2 py-1 text-xs font-medium text-emce-light shadow-emce-hover",
      "data-[state=delayed-open]:animate-in data-[state=closed]:animate-out",
      "data-[state=delayed-open]:fade-in-0 data-[state=closed]:fade-out-0",
      "data-[state=delayed-open]:zoom-in-95 data-[state=closed]:zoom-out-95",
      "data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1",
      "data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1",
      className,
    )}
    {...props}
  />
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

/**
 * Convenience wrapper for the 95% case — just a string of content
 * around a single trigger child. Falls through to the underlying
 * Radix primitives via `asChild` so existing buttons / links keep
 * their refs.
 */
export function Tooltip({
  content,
  children,
  side = "top",
  delayDuration = 200,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  delayDuration?: number;
}) {
  // No-op when content is empty so callers can conditionally hide
  // the tooltip without unmounting the trigger.
  if (!content) return <>{children}</>;
  return (
    <TooltipRoot delayDuration={delayDuration}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipPortal>
        <TooltipContent side={side}>{content}</TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  );
}

export {
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
  TooltipContent,
  TooltipPortal,
};
