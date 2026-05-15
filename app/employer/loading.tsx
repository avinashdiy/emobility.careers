import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * /employer dashboard loading shell. The EmployerShell wraps every
 * /employer/* route, so any sibling loading.tsx renders inside it
 * automatically (the shell stays, only the main content swaps to
 * the skeleton). Mirrors the dashboard's "Welcome to {company} /
 * 3 stat tiles / Recent jobs + Quick actions" structure so cards
 * don't shift when real data arrives.
 */
export default function EmployerLoading() {
  return (
    <div className="container max-w-6xl space-y-6 py-8">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-32" />
      </div>

      {/* 3 stat tiles */}
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="p-5">
            <Skeleton className="h-9 w-12" />
            <Skeleton className="mt-2 h-3 w-24" />
          </Card>
        ))}
      </div>

      {/* Recent jobs + Quick actions */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4 md:col-span-2">
          <Skeleton className="h-5 w-32" />
          <div className="mt-3 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between rounded-md border border-emce-border p-3">
                <div className="flex-1">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="mt-2 h-3 w-1/3" />
                </div>
                <Skeleton className="h-8 w-20" />
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-4">
          <Skeleton className="h-5 w-28" />
          <div className="mt-3 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
