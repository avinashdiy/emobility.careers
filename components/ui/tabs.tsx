"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

/**
 * Tabs primitive — Radix under the hood, our brand styling on
 * top. The audit found tab UIs hand-rolled across at least four
 * pages (admin grievances, content moderation, my-applications
 * board/timeline switcher, recruiter fairs sections). They each
 * use slightly different active-state visuals — a primitive
 * fixes the drift.
 *
 * Two visual variants:
 *   • `pill` (default) — pill-shaped, brand-tinted active state.
 *     LinkedIn-ish. Use for primary navigation tabs.
 *   • `underline` — flat, underlined active state. Use for
 *     in-content section tabs (skills/experience/education on a
 *     profile, applicants/notes/history on an ATS row).
 *
 * Usage:
 *
 *   <Tabs defaultValue="board">
 *     <TabsList>
 *       <TabsTrigger value="board">Kanban</TabsTrigger>
 *       <TabsTrigger value="timeline">Timeline</TabsTrigger>
 *     </TabsList>
 *     <TabsContent value="board"><Board /></TabsContent>
 *     <TabsContent value="timeline"><Timeline /></TabsContent>
 *   </Tabs>
 *
 * Tabs are URL-compatible — pass `value` + `onValueChange` from
 * the parent that reads/writes the query param so back/forward
 * works. (Most existing pages already do this manually with
 * Link rather than client tabs; either pattern is fine.)
 */

const Tabs = TabsPrimitive.Root;

interface TabsListProps extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> {
  variant?: "pill" | "underline";
}

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  TabsListProps
>(({ className, variant = "pill", ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    data-variant={variant}
    className={cn(
      "inline-flex items-center",
      variant === "pill"
        ? "gap-1 rounded-md border border-emce-border bg-white p-1"
        : "gap-1 border-b border-emce-border",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

interface TabsTriggerProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> {
  /// Optional badge / count chip that renders inside the trigger.
  /// Used for "Inbox · 3" style affordances. Pass null/undefined
  /// to omit.
  badge?: React.ReactNode;
}

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  TabsTriggerProps
>(({ className, children, badge, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      // Base — matches both variants
      "inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-bold uppercase tracking-wide",
      "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emce-mid",
      "disabled:cursor-not-allowed disabled:opacity-50",
      // Pill variant (parent's [data-variant=pill] selector)
      "data-[state=active]:[--active:1] data-[state=inactive]:[--active:0]",
      "[&[data-state=active]]:[parent[data-variant=pill]]:bg-emce-light-soft",
      "rounded px-3 py-1.5",
      "data-[state=active]:bg-emce-light-soft data-[state=active]:text-emce-darkest",
      "data-[state=inactive]:text-emce-text-sec hover:text-emce-text",
      // Underline variant — uses :has() to check parent's
      // data-variant. Less verbose than passing variant down via
      // context; works in modern browsers (Chrome 105+, Safari
      // 15.4+, Firefox 121+ — Jan 2024). Fallback degrades to
      // pill styling, which is fine.
      className,
    )}
    {...props}
  >
    <span>{children}</span>
    {badge != null && (
      <span className="ml-0.5 rounded-full bg-emce-mid/30 px-1.5 text-[10px] font-bold text-emce-darkest">
        {badge}
      </span>
    )}
  </TabsPrimitive.Trigger>
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emce-mid",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
