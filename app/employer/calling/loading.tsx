import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

/** Loading shell for /employer/calling — calling sessions list. The
 *  table can be 60 rows deep on a busy week; we skeleton 6 rows which
 *  is roughly what fits above the fold. */
export default function CallingLoading() {
  return (
    <div className="container max-w-5xl space-y-6 py-10">
      <div className="space-y-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <Card className="divide-y divide-emce-border p-0 dark:divide-border">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-4">
            <Skeleton variant="circle" className="h-10 w-10 flex-shrink-0" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="h-3 w-2/3" />
            </div>
            <div className="hidden gap-2 sm:flex">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
