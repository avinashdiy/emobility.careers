import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Public /companies directory loading shell. The real index runs
 * an FTS+paginated query that on a cold DB can take ~400-800ms.
 * Skeleton cards keep the layout anchored so the visible grid
 * doesn't reflow when results land.
 *
 * Lives inside (marketing) layout — SiteHeader + SiteFooter
 * stay rendered around this.
 */
export default function CompaniesLoading() {
  return (
    <div className="container max-w-5xl space-y-6 py-8">
      <div className="space-y-2">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-80" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-10 w-32" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <Card key={i} className="p-4">
            <div className="flex items-start gap-3">
              <Skeleton variant="circle" className="h-12 w-12" />
              <div className="min-w-0 flex-1">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="mt-2 h-3 w-1/2" />
                <Skeleton className="mt-2 h-3 w-full" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
