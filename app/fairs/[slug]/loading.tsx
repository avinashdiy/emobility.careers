import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Instant loading shell for the fair detail page (/fairs/[slug]).
 * Clicking a fair from the list (or a shared link) previously left the
 * old view frozen during the page's render; this paints immediately so
 * the navigation feels instant. Mirrors the real layout — slim header,
 * dark hero band, then the About + featured-image + stats area.
 */
export default function FairDetailLoading() {
  return (
    <>
      <div className="h-14 border-b border-emce-border bg-white">
        <div className="container flex h-full items-center justify-between">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-8 w-40" />
        </div>
      </div>

      {/* Dark hero band — matches the real hero's emce-darkest surface
          so the swap is just the content resolving, not a colour flash. */}
      <section className="bg-emce-darkest">
        <div className="container max-w-5xl py-12 md:py-16">
          <Skeleton className="h-6 w-44 bg-white/20" />
          <Skeleton className="mt-4 h-10 w-3/4 bg-white/20" />
          <Skeleton className="mt-3 h-5 w-1/2 bg-white/20" />
          <div className="mt-6 flex flex-wrap gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-40 rounded-full bg-white/20" />
            ))}
          </div>
        </div>
      </section>

      {/* About + featured image */}
      <div className="container max-w-5xl space-y-8 py-8 md:py-10">
        <div className="grid gap-8 lg:grid-cols-[1.45fr_1fr]">
          <div className="space-y-3">
            <Skeleton className="h-3 w-32" />
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
          <Card className="overflow-hidden p-0">
            <Skeleton className="aspect-[16/10] w-full rounded-none" />
          </Card>
        </div>

        {/* Stat band */}
        <div className="flex flex-wrap justify-center gap-10 py-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2 text-center">
              <Skeleton className="mx-auto h-12 w-24" />
              <Skeleton className="mx-auto h-3 w-20" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
