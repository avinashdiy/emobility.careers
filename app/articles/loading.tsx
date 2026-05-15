import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";

/**
 * /articles index loading shell. SEO-heavy page that pulls the
 * article list + FTS results + categories in parallel. A
 * skeleton keeps the page above the fold from going blank
 * during the second-or-so it takes to resolve filtered queries
 * with `?q=...` or `?category=...`.
 */
export default function ArticlesLoading() {
  return (
    <>
      <SiteHeader />
      <main className="container max-w-5xl space-y-6 py-8">
        <div className="space-y-2">
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-4 w-96" />
        </div>

        {/* Search + filter row */}
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-10 w-32" />
        </div>

        {/* Article cards grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <Card key={i} className="overflow-hidden p-0">
              <Skeleton className="aspect-[3/2] w-full rounded-none" />
              <div className="space-y-2 p-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            </Card>
          ))}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
