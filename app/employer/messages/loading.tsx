import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Employer inbox loading shell. Same shape as /me/messages
 * (avatar + conversation preview rows). Lives inside
 * EmployerShell so the chrome stays anchored while the
 * conversation list loads.
 */
export default function EmployerMessagesLoading() {
  return (
    <div className="container max-w-4xl space-y-4 py-8">
      <Skeleton className="h-8 w-40" />
      <Card className="p-0">
        <ul className="divide-y divide-emce-border">
          {Array.from({ length: 8 }).map((_, i) => (
            <li key={i} className="flex items-start gap-3 p-4">
              <Skeleton variant="circle" className="h-10 w-10" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-12" />
                </div>
                <Skeleton className="mt-1 h-3 w-3/4" />
                <Skeleton className="mt-1 h-3 w-1/2" />
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
