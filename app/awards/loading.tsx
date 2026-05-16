import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

/**
 * Loading shell for /awards — Best EV Employers leaderboard.
 *
 * Layout: hero + N category sections (Best Overall, Best for Battery,
 * …) each with a podium-style top-3 row + a bullet list below. We
 * skeleton 3 categories worth so the user sees the page taking shape.
 */
export default function AwardsLoading() {
  return (
    <div className="min-h-screen bg-emce-light-bg">
      <section className="emce-mesh-hero relative px-4 py-12 text-white">
        <div className="container max-w-3xl space-y-3 text-center">
          <Skeleton className="mx-auto h-5 w-32 rounded-full bg-white/15" />
          <Skeleton className="mx-auto h-10 w-2/3 bg-white/20" />
          <Skeleton className="mx-auto h-4 w-1/2 bg-white/15" />
        </div>
      </section>
      <div className="container max-w-5xl space-y-10 py-10">
        {Array.from({ length: 3 }).map((_, group) => (
          <div key={group} className="space-y-3">
            <Skeleton className="h-6 w-56" />
            <div className="grid gap-3 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="flex flex-col items-center gap-2 p-5 text-center">
                  <Skeleton className="h-14 w-14 rounded-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
