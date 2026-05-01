import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading shell for /fairs (public list of recruitment drives).
 * Hero gradient + 4 fair-card placeholders so the list page feels
 * alive while the drive query resolves. The hero matches the real
 * page's `emce-hero-gradient` class so the load → loaded
 * transition is just the cards swapping in, not a full repaint.
 */
export default function FairsLoading() {
  return (
    <main className="min-h-screen bg-emce-light-bg">
      <section className="emce-hero-gradient text-white">
        <div className="container max-w-5xl py-10 md:py-14">
          <div className="space-y-2">
            <Skeleton className="h-5 w-40 bg-white/30" />
            <Skeleton className="h-9 w-2/3 bg-white/30" />
            <Skeleton className="h-5 w-1/2 bg-white/30" />
          </div>
        </div>
      </section>
      <div className="container max-w-5xl space-y-6 py-10">
        <Skeleton className="h-7 w-36" />
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="overflow-hidden p-0">
              <Skeleton className="aspect-[3/1] w-full rounded-none" />
              <div className="p-4 space-y-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </Card>
          ))}
        </div>
      </div>
    </main>
  );
}
