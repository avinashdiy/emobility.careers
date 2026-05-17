import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { AdminShell } from "@/components/layout/admin-shell";
import { ToastFromSearchParams } from "@/components/ui/toast-from-params";
import { PageHeader } from "@/components/ui/page-header";
import { cancelInterview } from "@/server/interviews/actions";
import { InterviewStatus, InterviewMode } from "@prisma/client";

export const metadata: Metadata = { title: "Interviews · Admin" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<
  InterviewStatus,
  "default" | "success" | "danger" | "outline" | "warning"
> = {
  SCHEDULED: "default",
  COMPLETED: "success",
  CANCELLED: "danger",
  NO_SHOW: "outline",
  RESCHEDULED: "warning",
};

const MODE_LABEL: Record<InterviewMode, string> = {
  VIDEO: "📹 Video",
  ONSITE: "📍 Onsite",
  PHONE: "📞 Phone",
};

const PAGE_SIZE = 50;

/**
 * Cross-company interview view for admins. The recruiter view at
 * `/employer/applications/[id]` exposes interviews on a single
 * application — this is the panopticon for fair ops to spot
 * upcoming-but-unconfirmed interviews, no-show patterns, and
 * problematic reschedules.
 *
 * Filters: status, mode, date range (default = next 30 days), and
 * a candidate/job/company text search. Three quick-range chips
 * (Today, This week, Past) bookmark the common views.
 *
 * Admin can cancel an interview from this view via the existing
 * `cancelInterview` server action — it already lets ADMIN through.
 */
export default async function AdminInterviewsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    mode?: string;
    range?: string;
    q?: string;
    page?: string;
  }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const sp = await searchParams;

  const status =
    sp.status && (Object.values(InterviewStatus) as string[]).includes(sp.status)
      ? (sp.status as InterviewStatus)
      : null;
  const mode =
    sp.mode && (Object.values(InterviewMode) as string[]).includes(sp.mode)
      ? (sp.mode as InterviewMode)
      : null;
  const range = sp.range === "today" || sp.range === "past" || sp.range === "all" ? sp.range : "week";
  const q = sp.q?.trim() ?? "";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  // Date range — IST-aware. "week" = today through +7d.
  // "today" = today (midnight to midnight IST).
  // "past" = last 30 days. "all" = no date filter.
  const now = new Date();
  let startsAtFilter: { gte?: Date; lte?: Date } | undefined;
  if (range === "today") {
    const startOfDay = new Date(now);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);
    startsAtFilter = { gte: startOfDay, lte: endOfDay };
  } else if (range === "week") {
    const weekEnd = new Date(now);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
    startsAtFilter = { gte: now, lte: weekEnd };
  } else if (range === "past") {
    const monthAgo = new Date(now);
    monthAgo.setUTCDate(monthAgo.getUTCDate() - 30);
    startsAtFilter = { gte: monthAgo, lte: now };
  }
  // range === "all" → no filter.

  const where = {
    ...(status ? { status } : {}),
    ...(mode ? { mode } : {}),
    ...(startsAtFilter ? { scheduledAt: startsAtFilter } : {}),
    ...(q
      ? {
          OR: [
            { application: { candidate: { firstName: { contains: q, mode: "insensitive" as const } } } },
            { application: { candidate: { lastName: { contains: q, mode: "insensitive" as const } } } },
            { application: { candidate: { user: { email: { contains: q, mode: "insensitive" as const } } } } },
            { application: { job: { title: { contains: q, mode: "insensitive" as const } } } },
            { application: { job: { company: { name: { contains: q, mode: "insensitive" as const } } } } },
          ],
        }
      : {}),
  };

  const [total, interviews, upcomingCount, scheduledCount, completedCount, noShowCount] =
    await Promise.all([
      db.interview.count({ where }),
      db.interview.findMany({
        where,
        orderBy: { scheduledAt: range === "past" ? "desc" : "asc" },
        take: PAGE_SIZE,
        skip: (page - 1) * PAGE_SIZE,
        include: {
          application: {
            include: {
              candidate: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  slug: true,
                  profilePhotoUrl: true,
                  user: { select: { email: true } },
                },
              },
              job: {
                select: {
                  id: true,
                  title: true,
                  company: { select: { id: true, name: true, slug: true } },
                },
              },
            },
          },
        },
      }),
      db.interview.count({
        where: { status: "SCHEDULED", scheduledAt: { gte: now } },
      }),
      db.interview.count({ where: { status: "SCHEDULED" } }),
      db.interview.count({ where: { status: "COMPLETED" } }),
      db.interview.count({ where: { status: "NO_SHOW" } }),
    ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <AdminShell>
      <div className="container max-w-7xl space-y-6 py-6 md:py-8">
        <ToastFromSearchParams />
        <PageHeader
          eyebrow="Interviews · cross-company"
          title="Scheduled interviews"
          subtitle={
            <>
              <strong>{upcomingCount}</strong> upcoming · <strong>{scheduledCount}</strong>{" "}
              scheduled · {completedCount} completed · {noShowCount} no-show
            </>
          }
        />

        {/* Range chips */}
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ["today", "Today"],
              ["week", "Next 7 days"],
              ["past", "Past 30 days"],
              ["all", "All time"],
            ] as const
          ).map(([r, label]) => (
            <Link
              key={r}
              href={
                `/admin/interviews?range=${r}` +
                (status ? `&status=${status}` : "") +
                (mode ? `&mode=${mode}` : "") +
                (q ? `&q=${encodeURIComponent(q)}` : "")
              }
              className={`inline-flex h-9 items-center justify-center rounded-md border px-4 text-xs font-bold ${
                range === r
                  ? "border-emce-dark bg-emce-dark text-white"
                  : "border-emce-border bg-white text-emce-dark hover:bg-emce-light-soft"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Filters */}
        <Card className="p-4">
          <form
            action="/admin/interviews"
            method="get"
            className="grid gap-3 sm:grid-cols-4"
          >
            <input type="hidden" name="range" value={range} />
            <div>
              <Label htmlFor="status">Status</Label>
              <NativeSelect id="status" name="status" defaultValue={status ?? ""}>
                <option value="">Any</option>
                {(Object.values(InterviewStatus) as InterviewStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {s.toLowerCase().replace("_", "-")}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div>
              <Label htmlFor="mode">Mode</Label>
              <NativeSelect id="mode" name="mode" defaultValue={mode ?? ""}>
                <option value="">Any</option>
                {(Object.values(InterviewMode) as InterviewMode[]).map((m) => (
                  <option key={m} value={m}>
                    {MODE_LABEL[m]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="q">Search</Label>
              <Input
                id="q"
                name="q"
                defaultValue={q}
                placeholder="Candidate, job title, company"
                maxLength={120}
              />
            </div>
            <div className="sm:col-span-4 flex justify-end gap-3">
              {(status || mode || q) && (
                <Link
                  href={`/admin/interviews?range=${range}`}
                  className="text-hint font-bold text-emce-text-sec hover:text-emce-dark"
                >
                  Clear
                </Link>
              )}
              <SubmitButton size="sm" variant="outline">Apply</SubmitButton>
            </div>
          </form>
        </Card>

        {/* List */}
        {interviews.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="text-body text-emce-text-sec">
              No interviews match this filter.
            </p>
          </Card>
        ) : (
          <Card className="overflow-hidden p-0">
            <ul className="divide-y divide-emce-border">
              {interviews.map((iv) => {
                const isUpcoming = iv.scheduledAt > now && iv.status === "SCHEDULED";
                return (
                  <li key={iv.id} className="flex flex-wrap items-start gap-3 p-3">
                    {/* When */}
                    <div className="w-44 shrink-0">
                      <p className="font-mono text-sm font-bold text-emce-text tabular-nums">
                        {iv.scheduledAt.toLocaleString("en-IN", {
                          timeZone: "Asia/Kolkata",
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          hour: "numeric",
                          minute: "2-digit",
                          hour12: true,
                        })}
                      </p>
                      <p className="text-hint text-emce-text-muted">
                        {iv.durationMins} min · {MODE_LABEL[iv.mode]}
                      </p>
                      {isUpcoming && (
                        <Badge variant="warning" size="sm" className="mt-1">
                          Upcoming
                        </Badge>
                      )}
                    </div>

                    {/* Who */}
                    <Avatar
                      src={iv.application.candidate.profilePhotoUrl}
                      name={`${iv.application.candidate.firstName} ${iv.application.candidate.lastName ?? ""}`}
                      size="sm"
                      className="h-10 w-10 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/${iv.application.candidate.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate text-sm font-bold text-emce-text hover:underline"
                      >
                        {iv.application.candidate.firstName}{" "}
                        {iv.application.candidate.lastName ?? ""}
                      </Link>
                      <p className="line-clamp-1 text-hint text-emce-text-sec">
                        <Link
                          href={`/jobs/${iv.application.job.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-bold text-emce-dark hover:underline"
                        >
                          {iv.application.job.title}
                        </Link>{" "}
                        ·{" "}
                        <Link
                          href={`/company/${iv.application.job.company.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                        >
                          {iv.application.job.company.name}
                        </Link>
                      </p>
                      <p className="text-[10px] text-emce-text-muted">
                        {iv.application.candidate.user.email}
                      </p>
                      {iv.location && (
                        <p className="mt-1 text-hint text-emce-text-sec">
                          📍 {iv.location}
                        </p>
                      )}
                      {iv.meetingUrl && (
                        <p className="mt-1 truncate text-hint">
                          <a
                            href={iv.meetingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-bold text-emce-dark hover:underline"
                          >
                            🔗 Meeting link
                          </a>
                        </p>
                      )}
                    </div>

                    {/* Status + actions */}
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant={STATUS_TONE[iv.status]} size="sm">
                        {iv.status.toLowerCase().replace("_", "-")}
                      </Badge>
                      <Link
                        href={`/employer/applications/${iv.applicationId}`}
                        className="text-hint font-bold text-emce-dark hover:underline"
                      >
                        Open application →
                      </Link>
                      {iv.status === "SCHEDULED" && (
                        <form action={cancelInterview}>
                          <input type="hidden" name="id" value={iv.id} />
                          <ConfirmSubmit
                            variant="ghost"
                            size="sm"
                            confirm="Cancel this interview on behalf of the recruiter? Candidate will be notified."
                            pendingLabel="Cancelling…"
                            className="text-emce-red-deep"
                          >
                            Cancel
                          </ConfirmSubmit>
                        </form>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-hint text-emce-text-sec">
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={
                    "/admin/interviews?page=" +
                    (page - 1) +
                    `&range=${range}` +
                    (status ? `&status=${status}` : "") +
                    (mode ? `&mode=${mode}` : "") +
                    (q ? `&q=${encodeURIComponent(q)}` : "")
                  }
                  className="inline-flex h-9 items-center justify-center rounded-md border border-emce-border bg-white px-4 text-sm font-bold text-emce-dark hover:bg-emce-light-soft"
                >
                  ← Prev
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={
                    "/admin/interviews?page=" +
                    (page + 1) +
                    `&range=${range}` +
                    (status ? `&status=${status}` : "") +
                    (mode ? `&mode=${mode}` : "") +
                    (q ? `&q=${encodeURIComponent(q)}` : "")
                  }
                  className="inline-flex h-9 items-center justify-center rounded-md border border-emce-border bg-white px-4 text-sm font-bold text-emce-dark hover:bg-emce-light-soft"
                >
                  Next →
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
