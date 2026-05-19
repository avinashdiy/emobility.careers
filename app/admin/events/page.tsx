import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Avatar } from "@/components/ui/avatar";
import { AdminShell } from "@/components/layout/admin-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { ToastFromSearchParams } from "@/components/ui/toast-from-params";
import { cancelEvent } from "@/server/events/actions";
import { relativeTime } from "@/lib/utils";
import type { EventStatus } from "@prisma/client";

export const metadata: Metadata = { title: "Events · admin" };
export const dynamic = "force-dynamic";

const STATUS_FILTERS = ["OPEN", "DRAFT", "CANCELLED", "COMPLETED"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

function isStatusFilter(s: string | undefined): s is StatusFilter {
  return !!s && (STATUS_FILTERS as readonly string[]).includes(s);
}

/**
 * Admin moderation queue for company-posted events (webinars, demo
 * days, meetups, workshops). Mirrors the pattern of
 * /admin/competitions — list view with status filter chips + per-
 * row quick actions (Cancel, view public page, view employer-side
 * detail).
 *
 * Why this exists: events can be posted by any verified company
 * via /employer/events/new. Without a central admin queue, the
 * placement team had no way to spot a misleading title, an
 * inappropriate cover image, or a spammy series — they had to wait
 * for a user report. This page closes that gap.
 *
 * Filter defaults to OPEN because that's the action queue —
 * everything currently visible to candidates. Other statuses are
 * audit / history surfaces.
 */
export default async function AdminEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const sp = await searchParams;
  const status: StatusFilter = isStatusFilter(sp.status?.toUpperCase())
    ? (sp.status!.toUpperCase() as StatusFilter)
    : "OPEN";
  const search = (sp.q ?? "").trim();

  // Status counts via one groupBy — feeds the chip badges so admins
  // see how big each queue is before clicking.
  const [events, statusCounts] = await Promise.all([
    db.event.findMany({
      where: {
        status,
        ...(search.length > 0
          ? {
              OR: [
                { title: { contains: search, mode: "insensitive" } },
                { company: { name: { contains: search, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      orderBy: [{ startsAt: "asc" }, { createdAt: "desc" }],
      take: 100,
      include: {
        company: { select: { name: true, slug: true, logoUrl: true } },
        createdBy: { select: { name: true, email: true } },
        _count: { select: { registrations: true } },
      },
    }),
    db.event.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  const countByStatus = Object.fromEntries(
    statusCounts.map((s) => [s.status, s._count._all]),
  ) as Partial<Record<EventStatus, number>>;

  return (
    <AdminShell>
      <div className="container max-w-6xl py-8">
        <ToastFromSearchParams />
        <div>
          <h1 className="text-dashboard text-emce-text">Events</h1>
          <p className="mt-1 text-hint text-emce-text-sec">
            Webinars, demo days, meetups, and workshops posted by companies via{" "}
            <code className="rounded bg-emce-light-soft px-1 py-0.5 text-[11px]">
              /employer/events/new
            </code>
            . Cancel anything that violates policy; everything else is
            audit-only.
          </p>
        </div>

        {/* Search + filter chip row */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <form action="" method="GET" className="flex items-center gap-2">
            <input type="hidden" name="status" value={status} />
            <input
              type="search"
              name="q"
              defaultValue={search}
              placeholder="Search by event or company name…"
              className="h-9 w-72 rounded-md border border-emce-border px-3 text-sm focus:border-emce-mid focus:outline-none"
            />
            {search && (
              <Link
                href={`/admin/events?status=${status}`}
                className="text-xs font-semibold text-emce-text-sec hover:text-emce-dark"
              >
                Clear
              </Link>
            )}
          </form>
        </div>

        <nav
          aria-label="Filter events by status"
          className="mt-3 flex flex-wrap gap-1.5"
        >
          {STATUS_FILTERS.map((s) => {
            const count = countByStatus[s] ?? 0;
            const isActive = s === status;
            return (
              <Link
                key={s}
                href={`/admin/events?status=${s}${search ? `&q=${encodeURIComponent(search)}` : ""}`}
                aria-current={isActive ? "page" : undefined}
                className={[
                  "inline-flex h-9 items-center rounded-full border px-3 text-xs font-semibold transition",
                  isActive
                    ? "border-emce-dark bg-emce-dark text-white"
                    : "border-emce-border bg-white text-emce-dark hover:border-emce-mid hover:bg-emce-light-soft",
                ].join(" ")}
              >
                <span>{s[0] + s.slice(1).toLowerCase()}</span>
                {count > 0 && (
                  <span
                    className={`ml-1.5 rounded-sm px-1 text-[10px] font-bold ${
                      isActive
                        ? "bg-white/20 text-current"
                        : "bg-emce-light-soft text-emce-text-sec"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {events.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              icon="📅"
              title={`No ${status.toLowerCase()} events`}
              body={
                search
                  ? "No events match your search. Try a different keyword or clear the filter."
                  : status === "OPEN"
                    ? "Nothing live right now. Events appear here as soon as a verified company publishes one."
                    : `No ${status.toLowerCase()} events in the archive.`
              }
            />
          </div>
        ) : (
          <ul className="mt-5 space-y-3">
            {events.map((e) => {
              const when = e.startsAt.toLocaleString("en-IN", {
                dateStyle: "medium",
                timeStyle: "short",
              });
              const isPast = e.startsAt < new Date();
              return (
                <li key={e.id}>
                  <Card className="p-4">
                    <div className="flex flex-wrap items-start gap-3">
                      <Avatar
                        src={e.company.logoUrl}
                        name={e.company.name}
                        size="md"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <Link
                            href={`/events/${e.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-base font-semibold text-emce-text hover:underline"
                          >
                            {e.title}
                          </Link>
                          <Badge
                            variant={
                              e.status === "OPEN"
                                ? "success"
                                : e.status === "CANCELLED"
                                  ? "danger"
                                  : e.status === "COMPLETED"
                                    ? "default"
                                    : "outline"
                            }
                            size="sm"
                          >
                            {e.status}
                          </Badge>
                          <Badge variant="outline" size="sm">
                            {e.eventType}
                          </Badge>
                          {isPast && e.status === "OPEN" && (
                            <Badge variant="warning" size="sm">
                              Past · still OPEN
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 text-hint text-emce-text-sec">
                          <Link
                            href={`/company/${e.company.slug}`}
                            className="font-semibold text-emce-text hover:underline"
                          >
                            {e.company.name}
                          </Link>
                          {" · "}
                          🗓 {when}
                          {e.location && ` · 📍 ${e.location}`}
                          {e.capacity && ` · capacity ${e.capacity}`}
                        </p>
                        <p className="mt-0.5 text-hint text-emce-text-muted">
                          {e._count.registrations} registered ·
                          posted {relativeTime(e.createdAt)}
                          {e.createdBy &&
                            ` · by ${e.createdBy.name ?? e.createdBy.email}`}
                        </p>
                      </div>
                      <div className="flex flex-shrink-0 flex-wrap gap-2">
                        <Button asChild size="sm" variant="outline">
                          <Link
                            href={`/events/${e.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            ↗ Public page
                          </Link>
                        </Button>
                        {e.status === "OPEN" && (
                          <form action={cancelEventAction}>
                            <input type="hidden" name="id" value={e.id} />
                            <ConfirmSubmit
                              variant="ghost"
                              size="sm"
                              confirm={`Cancel "${e.title}"? Registered attendees get a cancellation notification + email. This action is logged.`}
                              className="text-emce-red-deep hover:bg-emce-red-light"
                            >
                              Cancel event
                            </ConfirmSubmit>
                          </form>
                        )}
                      </div>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-3 text-hint text-emce-text-sec">
          Showing {events.length} {status.toLowerCase()} event
          {events.length === 1 ? "" : "s"}
          {events.length === 100 ? " (capped at 100 — refine your search)" : ""}.
        </p>
      </div>
    </AdminShell>
  );
}

// Page-level form-action shim. `cancelEvent` returns FormState; page
// forms need a void return. Same pattern used by the fair-admin page.
async function cancelEventAction(formData: FormData): Promise<void> {
  "use server";
  await cancelEvent(formData);
}
