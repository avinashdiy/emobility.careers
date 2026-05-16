import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

/** Loading shell for /employer/jobs/[id]/assistant — AI Hiring
 *  Assistant config + recent runs. Two-card stack: config form on top,
 *  run history below. */
export default function AssistantLoading() {
  return (
    <div className="container max-w-4xl space-y-6 py-10">
      <div className="space-y-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <Card className="space-y-4 p-5">
        <Skeleton className="h-5 w-48" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
        <Skeleton className="h-24 w-full" />
        <div className="flex justify-between">
          <Skeleton className="h-10 w-36" />
          <Skeleton className="h-10 w-32" />
        </div>
      </Card>
      <Card className="space-y-3 p-5">
        <Skeleton className="h-5 w-44" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-md border border-emce-border p-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <div className="mt-2 grid grid-cols-3 gap-3">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
