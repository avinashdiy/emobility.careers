import { Card } from "@/components/ui/card";
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";

/**
 * Loading shell for /me/applications. Mirrors the kanban-board
 * default view — six columns of cards — so the layout doesn't
 * shift when real applications resolve.
 *
 * The Timeline view shares this shell intentionally: a column
 * skeleton is a generic enough "stuff is loading" signal that
 * we don't need a separate timeline shell. Once the page mounts
 * the URL query param decides which real layout renders.
 */
export default function ApplicationsLoading() {
  return (
    <div className="container max-w-6xl space-y-6 py-8">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Card className="p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-7 w-12" />
            </div>
          ))}
        </div>
      </Card>
      <Skeleton className="h-9 w-44" />
      <div className="flex gap-3 overflow-x-auto pb-3 lg:grid lg:grid-cols-6">
        {["Saved", "Applied", "Screening", "Interview", "Offered", "Closed"].map((col) => (
          <div key={col} className="min-w-[220px] space-y-2">
            <div className="rounded-t-md bg-emce-light-soft px-3 py-2">
              <Skeleton className="h-3 w-1/2" />
            </div>
            <div className="rounded-b-md border border-t-0 border-emce-border bg-white p-2 space-y-2">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
