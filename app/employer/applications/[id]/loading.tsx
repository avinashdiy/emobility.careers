import { Card } from "@/components/ui/card";
import { EmployerShell } from "@/components/layout/employer-shell";

/**
 * Skeleton for the application-detail page. Mirrors the real page's
 * two-column shell (applicant sidebar + main column) so the visible
 * shape doesn't reflow when the real content lands.
 *
 * Why this exists: without a loading.tsx, clicking another candidate
 * in the sidebar shows the previous candidate's page until the new
 * one finishes server-rendering (which includes the siblings query
 * + main app query + sometimes a lazy OpenAI summary generation).
 * On a 28-applicant pipeline that's a multi-second "click then
 * nothing happens" gap. With this loading.tsx, the browser swaps in
 * a skeleton on click and the real page streams in behind it — the
 * navigation feels instant.
 *
 * The skeleton is intentionally lightweight (no DB queries, no
 * client components) so it renders in <50ms even on the cheapest
 * Hetzner instance.
 */
export default function ApplicationDetailLoading() {
  return (
    <EmployerShell>
      <div className="container max-w-7xl py-6" aria-busy="true" aria-live="polite">
        <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
          {/* Sidebar skeleton — mirrors the stage-grouped applicant list. */}
          <aside className="hidden lg:block">
            <div className="sticky top-20 space-y-4">
              <div className="h-3 w-24 animate-pulse rounded bg-emce-border" />
              <div className="h-3 w-40 animate-pulse rounded bg-emce-border" />
              {[0, 1, 2].map((group) => (
                <div key={group} className="space-y-1.5">
                  <div className="h-4 w-16 animate-pulse rounded bg-emce-border" />
                  {[0, 1, 2, 3].map((row) => (
                    <div
                      key={row}
                      className="flex items-center gap-2 rounded-md p-1.5"
                    >
                      <div className="h-7 w-7 shrink-0 animate-pulse rounded-full bg-emce-border" />
                      <div className="h-3 flex-1 animate-pulse rounded bg-emce-border" />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </aside>

          {/* Main column skeleton — header card + content blocks. */}
          <div className="min-w-0 space-y-4">
            {/* Prev/next nav row */}
            <div className="mb-4 flex items-center justify-end gap-2">
              <div className="h-8 w-20 animate-pulse rounded-md bg-emce-border" />
              <div className="h-3 w-12 animate-pulse rounded bg-emce-border" />
              <div className="h-8 w-20 animate-pulse rounded-md bg-emce-border" />
              <div className="h-6 w-16 animate-pulse rounded bg-emce-border" />
            </div>

            {/* Candidate header card */}
            <Card className="p-4 sm:p-6">
              <div className="flex gap-4">
                <div className="h-16 w-16 shrink-0 animate-pulse rounded-full bg-emce-border" />
                <div className="flex-1 space-y-2">
                  <div className="h-6 w-3/5 animate-pulse rounded bg-emce-border" />
                  <div className="h-4 w-4/5 animate-pulse rounded bg-emce-border" />
                  <div className="h-3 w-2/5 animate-pulse rounded bg-emce-border" />
                </div>
              </div>
              <div className="mt-4 h-20 animate-pulse rounded-md bg-emce-light-soft" />
            </Card>

            {/* Content + sidebar grid */}
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="space-y-4 lg:col-span-2">
                <Card className="p-6">
                  <div className="h-5 w-32 animate-pulse rounded bg-emce-border" />
                  <div className="mt-3 h-[640px] animate-pulse rounded-md bg-emce-light-soft" />
                </Card>
                <Card className="p-6">
                  <div className="h-5 w-24 animate-pulse rounded bg-emce-border" />
                  <div className="mt-3 space-y-2">
                    <div className="h-3 w-full animate-pulse rounded bg-emce-border" />
                    <div className="h-3 w-5/6 animate-pulse rounded bg-emce-border" />
                    <div className="h-3 w-4/6 animate-pulse rounded bg-emce-border" />
                  </div>
                </Card>
              </div>
              <aside className="space-y-4">
                {[0, 1, 2].map((i) => (
                  <Card key={i} className="p-6">
                    <div className="h-5 w-28 animate-pulse rounded bg-emce-border" />
                    <div className="mt-3 h-10 animate-pulse rounded-md bg-emce-border" />
                    <div className="mt-2 h-10 animate-pulse rounded-md bg-emce-border" />
                  </Card>
                ))}
              </aside>
            </div>
          </div>
        </div>
        <span className="sr-only">Loading candidate…</span>
      </div>
    </EmployerShell>
  );
}
