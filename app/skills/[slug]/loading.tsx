import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

/**
 * Loading shell for /skills/[slug] — assessment detail page.
 *
 * Layout: hero with title + badge, then a two-column block (overview
 * + sidebar with "take this" CTA + prep links). The sidebar height
 * dominates so the skeleton uses a tall right rail to keep the page
 * from jumping when content loads.
 */
export default function SkillDetailLoading() {
  return (
    <div className="min-h-screen bg-emce-light-bg">
      <section className="emce-mesh-hero relative px-4 py-10 text-white">
        <div className="container max-w-3xl space-y-3">
          <Skeleton className="h-5 w-32 rounded-full bg-white/15" />
          <Skeleton className="h-10 w-3/4 bg-white/20" />
          <Skeleton className="h-4 w-1/2 bg-white/15" />
        </div>
      </section>
      <div className="container grid max-w-5xl gap-6 py-10 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="space-y-3 p-5">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
          </Card>
          <Card className="space-y-3 p-5">
            <Skeleton className="h-5 w-32" />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-start gap-2">
                <Skeleton className="h-4 w-4 rounded-full" />
                <Skeleton className="h-3 flex-1" />
              </div>
            ))}
          </Card>
        </div>
        <Card className="h-fit space-y-3 p-5">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
          <div className="border-t border-emce-border pt-3">
            <Skeleton className="h-4 w-28" />
            <div className="mt-2 space-y-2">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
