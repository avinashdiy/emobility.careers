import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

/**
 * Loading shell for /career-explorer — the public AI Career Explorer.
 *
 * Mirrors the real page: dark mesh-gradient hero with two large headline
 * blocks, then a soft input form below. Without this shell the route
 * waits ~600ms (the AI pre-fetch on `?r=<cacheKey>` cached link loads,
 * plus header server-side counts) showing a fully blank screen. The
 * skeleton keeps the brand frame stable so the eye lands on the same
 * coordinates the real content will land at.
 */
export default function CareerExplorerLoading() {
  return (
    <div className="min-h-screen bg-emce-light-bg">
      {/* Hero shell — matches the real `emce-mesh-hero` block. */}
      <section className="emce-mesh-hero relative px-4 py-14 text-white sm:py-20">
        <div className="container max-w-3xl space-y-4 text-center">
          <Skeleton className="mx-auto h-5 w-32 rounded-full bg-white/15" />
          <Skeleton className="mx-auto h-12 w-3/4 bg-white/20" />
          <Skeleton className="mx-auto h-5 w-2/3 bg-white/15" />
        </div>
      </section>
      <div className="container max-w-3xl space-y-4 py-10">
        <Card className="p-6 space-y-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-24 w-full" />
          <div className="flex justify-end">
            <Skeleton className="h-10 w-40" />
          </div>
        </Card>
      </div>
    </div>
  );
}
