import { Card } from "@/components/ui/card";
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";

/**
 * /me candidate-dashboard loading shell. The real page assembles
 * profile-completeness, recent applications, alerts, and saved
 * jobs — 4-6 queries depending on profile state. Without this
 * shell, navigating from /jobs → /me dropped users on a blank
 * white page for ~700ms while the data loaded.
 */
export default function MeLoading() {
  return (
    <>
      <SiteHeader />
      <main className="container max-w-5xl space-y-4 py-8">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>

        {/* Profile-completeness gauge */}
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-6 w-12" />
          </div>
          <Skeleton className="mt-3 h-2 w-full" />
        </Card>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="p-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-2 h-7 w-12" />
            </Card>
          ))}
        </div>

        {/* Recent activity + saved jobs */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-4">
            <Skeleton className="h-5 w-32" />
            <div className="mt-3 space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          </Card>
          <Card className="p-4">
            <Skeleton className="h-5 w-32" />
            <div className="mt-3 space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          </Card>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
