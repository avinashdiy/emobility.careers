import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

/** Loading shell for /employer/automations — pipeline rules list +
 *  create form. Same shape as /employer/cadences (a list card on
 *  top, a builder card below) so the skeletons stay sibling-consistent. */
export default function AutomationsLoading() {
  return (
    <div className="container max-w-5xl space-y-6 py-10">
      <div className="space-y-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <Card className="space-y-3 p-5">
        <Skeleton className="h-5 w-44" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-3 rounded-md border border-emce-border p-3">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-44" />
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
              <Skeleton className="h-3 w-2/3" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-7 w-16 rounded-full" />
              <Skeleton className="h-8 w-16" />
            </div>
          </div>
        ))}
      </Card>
      <Card className="space-y-3 p-5">
        <Skeleton className="h-5 w-40" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
        <Skeleton className="h-24 w-full" />
        <div className="flex justify-end">
          <Skeleton className="h-10 w-36" />
        </div>
      </Card>
    </div>
  );
}
