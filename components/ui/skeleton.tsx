import { cn } from "@/lib/utils";

/**
 * Skeleton loader primitive — one block + a few preset shapes for
 * common layouts. Driven by `animate-pulse` (Tailwind built-in)
 * over a soft brand-tinted bg so loading states feel on-brand
 * rather than the default Tailwind grey.
 *
 * Usage:
 *   <Skeleton className="h-4 w-32" />               // 1 line
 *   <Skeleton variant="circle" className="h-10 w-10" />  // avatar
 *   <SkeletonLines count={3} />                     // body paragraph
 *   <SkeletonCard />                                // job/profile card
 *
 * Accessibility: each Skeleton renders with role="status" + an
 * aria-label "Loading…" so screen-reader users hear that something
 * is happening rather than encountering silent empty boxes.
 *
 * Audit found ZERO `loading.tsx` files in app/ — every route
 * blocks until data resolves. Pairing this primitive with a few
 * `loading.tsx` shells (jobs, applications, profile) gets us most
 * of the perceived-performance win for a one-off cost.
 */
export function Skeleton({
  className,
  variant = "rect",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { variant?: "rect" | "circle" }) {
  return (
    <div
      role="status"
      aria-label="Loading…"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        "animate-pulse bg-emce-light-soft",
        variant === "circle" ? "rounded-full" : "rounded-md",
        className,
      )}
      {...props}
    />
  );
}

/**
 * N text-line skeletons stacked. The last line is intentionally
 * shorter — mimics a real paragraph's ragged-right edge so the
 * skeleton reads as text rather than a stack of bars.
 */
export function SkeletonLines({
  count = 3,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn("h-3", i === count - 1 ? "w-2/3" : "w-full")}
        />
      ))}
    </div>
  );
}

/**
 * Generic card skeleton — avatar + title line + 2 body lines +
 * action chip row. Matches the shape of JobCard, ProfileCard,
 * MentorCard, etc., so the layout doesn't shift when real
 * content lands.
 */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-emce-border bg-white p-4",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <Skeleton variant="circle" className="h-11 w-11 flex-shrink-0" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
          <div className="mt-1 flex gap-2">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Page-level skeleton — header + N cards. The standard "list
 * page" loading shell (jobs, applications, mentors). Caller
 * picks the count to roughly match the typical page density so
 * the layout stays put when real data arrives.
 */
export function SkeletonListPage({
  cardCount = 6,
  className,
}: {
  cardCount?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-6", className)}>
      <div className="space-y-2">
        <Skeleton className="h-7 w-1/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: cardCount }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
