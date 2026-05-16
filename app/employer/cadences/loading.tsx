import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

/**
 * Loading shell for /employer/cadences — sequenced outreach.
 *
 * The route does two DB queries before render (cadence list + open
 * jobs for the builder dropdown) so first paint is empty for ~200ms
 * on a warm cache. The skeleton renders the header, three cadence
 * rows, and the builder card so the page lays out instantly.
 *
 * EmployerShell wraps this automatically (loading.tsx sits inside
 * the same segment as the page) — we just render the body shell.
 */
export default function CadencesLoading() {
  return (
    <div className="container max-w-5xl space-y-6 py-10">
      <div className="space-y-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <Card className="space-y-3 p-5">
        <Skeleton className="h-5 w-40" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-3 rounded-md border border-emce-border p-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-7 w-16 rounded-full" />
              <Skeleton className="h-8 w-20" />
            </div>
          </div>
        ))}
      </Card>
      <Card className="space-y-3 p-5">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
        <div className="flex justify-end">
          <Skeleton className="h-10 w-36" />
        </div>
      </Card>
    </div>
  );
}
