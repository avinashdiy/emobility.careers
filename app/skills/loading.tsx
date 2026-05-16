import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

/**
 * Loading shell for /skills — public verified-skill-badge browse.
 *
 * The real page groups assessments by EV domain (battery, charging,
 * BMS, …). We render 3 domain blocks × 2 cards each so the skeleton's
 * height roughly equals the median populated page; arriving content
 * either fills in or reflows by ~half a viewport, not a full page.
 */
export default function SkillsLoading() {
  return (
    <div className="min-h-screen bg-emce-light-bg">
      <section className="emce-mesh-hero relative px-4 py-12 text-white">
        <div className="container max-w-3xl space-y-3 text-center">
          <Skeleton className="mx-auto h-5 w-40 rounded-full bg-white/15" />
          <Skeleton className="mx-auto h-10 w-3/4 bg-white/20" />
          <Skeleton className="mx-auto h-4 w-1/2 bg-white/15" />
        </div>
      </section>
      <div className="container max-w-5xl space-y-8 py-10">
        {Array.from({ length: 3 }).map((_, group) => (
          <div key={group} className="space-y-3">
            <Skeleton className="h-5 w-48" />
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Card key={i} className="space-y-3 p-4">
                  <div className="flex items-start justify-between">
                    <Skeleton className="h-5 w-2/3" />
                    <Skeleton className="h-5 w-12 rounded-full" />
                  </div>
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-4/5" />
                  <div className="flex gap-2">
                    <Skeleton className="h-6 w-20 rounded-full" />
                    <Skeleton className="h-6 w-24 rounded-full" />
                  </div>
                  <Skeleton className="h-9 w-32" />
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
