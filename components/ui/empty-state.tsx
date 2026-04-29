import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  body?: string;
  action?: React.ReactNode;
  className?: string;
}

/**
 * Standard empty-state card. Use when a list / collection has zero items so
 * we render a consistent voice across the app instead of one-off "no results"
 * blurbs. The icon prop accepts an emoji string OR a React node so callers
 * can drop in either `"🔎"` or `<SomeIcon/>`.
 */
export function EmptyState({ icon, title, body, action, className }: EmptyStateProps) {
  return (
    <div className={cn("rounded-lg border border-dashed border-emce-border bg-white p-10 text-center", className)}>
      {icon && <div className="text-4xl">{icon}</div>}
      <p className="mt-3 text-section font-bold text-emce-text">{title}</p>
      {body && <p className="mx-auto mt-1 max-w-md text-sm text-emce-text-sec">{body}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
