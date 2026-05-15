import { Card } from "@/components/ui/card";
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";

/**
 * Loading shell for /feed — the post-login landing page. The real
 * page does ~10 parallel DB queries (graph feed, suggestions,
 * weekly stats, latest jobs, mentorship sessions, ...), which on
 * a slow connection means a blank-content flash for 800-1500ms.
 *
 * Mirrors the real three-column layout (profile/stats rail, feed
 * column, right rail of suggestions + latest jobs) so cards don't
 * shift when the content lands.
 */
export default function FeedLoading() {
  return (
    <>
      <SiteHeader />
      <div className="container max-w-6xl py-4 md:py-6">
        <div className="grid gap-4 lg:grid-cols-12">
          {/* Left rail — profile mini-card + stats */}
          <aside className="hidden space-y-2 lg:col-span-3 lg:block">
            <Card className="overflow-hidden p-0">
              <Skeleton className="h-14 rounded-none" />
              <div className="-mt-8 px-3 pb-3 text-center">
                <Skeleton variant="circle" className="mx-auto h-[72px] w-[72px] ring-4 ring-white" />
                <Skeleton className="mx-auto mt-2 h-4 w-32" />
                <Skeleton className="mx-auto mt-1 h-3 w-40" />
              </div>
            </Card>
            <Card className="p-3">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="mt-2 h-3 w-3/4" />
              <Skeleton className="mt-2 h-3 w-2/3" />
            </Card>
          </aside>

          {/* Center column — composer + feed */}
          <main className="lg:col-span-6">
            <Card className="p-3">
              <div className="flex items-center gap-2">
                <Skeleton variant="circle" className="h-10 w-10" />
                <Skeleton className="h-10 flex-1 rounded-full" />
              </div>
            </Card>
            <div className="mt-2 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          </main>

          {/* Right rail — suggestions + latest jobs */}
          <aside className="hidden space-y-2 lg:col-span-3 lg:block">
            <Card className="p-3">
              <Skeleton className="h-4 w-40" />
              <div className="mt-3 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <Skeleton variant="circle" className="h-9 w-9" />
                    <div className="min-w-0 flex-1">
                      <Skeleton className="h-3 w-3/4" />
                      <Skeleton className="mt-1 h-3 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="p-3">
              <Skeleton className="h-4 w-32" />
              <div className="mt-3 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-3 w-full" />
                ))}
              </div>
            </Card>
          </aside>
        </div>
      </div>
      <SiteFooter />
    </>
  );
}
