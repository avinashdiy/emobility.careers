import { Card } from "@/components/ui/card";
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";

/**
 * Loading shell for /jobs. Mirrors the real page's layout —
 * header, filter bar, job cards — so when real data arrives the
 * page doesn't visibly reflow. Uses 5 card placeholders to roughly
 * match the average page density.
 *
 * Sits next to /jobs/page.tsx; Next.js pairs them automatically
 * so the candidate sees motion within ~50ms instead of a blank
 * page during the searchJobs() round-trip.
 */
export default function JobsLoading() {
  return (
    <div className="container py-10">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-9 w-64" />
        </div>
        <Skeleton className="h-9 w-44" />
      </div>
      <Card className="mb-6 p-4">
        <div className="grid gap-3 sm:grid-cols-12">
          <Skeleton className="h-10 sm:col-span-7" />
          <Skeleton className="h-10 sm:col-span-3" />
          <Skeleton className="h-10 sm:col-span-2" />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-20 rounded-full" />
          ))}
        </div>
      </Card>
      <ul className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <li key={i}>
            <SkeletonCard />
          </li>
        ))}
      </ul>
    </div>
  );
}
