import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Instant loading shell for /fairs/[slug]/register.
 *
 * Without this, clicking "Register as candidate/employer/TPO" left the
 * previous page frozen for the duration of the server render + client
 * chunk download + hydrate — employers reported a 3-5s "nothing
 * happens" gap. A loading boundary means the Link click paints this
 * skeleton instantly (and lets Next prefetch it), so the transition
 * feels immediate and the real form swaps in when ready.
 *
 * Mirrors the register page layout — slim header strip, title block,
 * 3-tab switcher, and a form card — so the load → loaded transition is
 * a content swap, not a repaint.
 */
export default function FairRegisterLoading() {
  return (
    <>
      {/* Header strip placeholder — the real page renders <SiteHeader/>
          inside itself, so without this the skeleton would briefly show
          no top bar and the header would pop in. */}
      <div className="h-14 border-b border-emce-border bg-white">
        <div className="container flex h-full items-center justify-between">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-8 w-40" />
        </div>
      </div>

      <div className="container max-w-3xl py-8 md:py-12">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="mt-3 h-8 w-3/4" />
        <Skeleton className="mt-2 h-4 w-1/2" />

        {/* Tab switcher (Candidate / Employer / TPO) */}
        <div className="mt-6 grid grid-cols-3 gap-2 rounded-md bg-emce-light-soft p-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>

        {/* Form card */}
        <Card className="mt-4 p-6 md:p-8">
          <div className="space-y-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
            <Skeleton className="h-11 w-full rounded-md" />
          </div>
        </Card>
      </div>
    </>
  );
}
