import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Candidate inbox loading shell. The real page renders a sidebar
 * list of conversation cards (with avatar + last-message preview).
 * Eight placeholder rows match the typical inbox depth on first
 * paint so the visible content doesn't jump.
 */
export default function MeMessagesLoading() {
  return (
    <div className="container max-w-3xl space-y-4 py-8">
      <Skeleton className="h-8 w-32" />
      <Card className="p-0">
        <ul className="divide-y divide-emce-border">
          {Array.from({ length: 8 }).map((_, i) => (
            <li key={i} className="flex items-start gap-3 p-4">
              <Skeleton variant="circle" className="h-10 w-10" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-12" />
                </div>
                <Skeleton className="mt-1 h-3 w-3/4" />
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
