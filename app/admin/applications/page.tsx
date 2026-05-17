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
import { moveStage } from "@/server/ats/actions";
import { relativeTime } from "@/lib/utils";
import { ApplicationStage } from "@prisma/client";

export const metadata: Metadata = { title: "Applications · Admin" };
export const dynamic = "force-dynamic";

const STAGE_TONE: Record<
  ApplicationStage,
  "default" | "success" | "danger" | "outline" | "warning"
> = {
  APPLIED: "default",
  SCREENED: "default",
  SHORTLISTED: "default",
  ASSESSMENT: "warning",
  INTERVIEW: "warning",
  OFFER: "success",
  HIRED: "success",
  REJECTED: "danger",
  WITHDRAWN: "outline",
};

const PAGE_SIZE = 50;

/**
 * Cross-company ATS view for admins. Mirrors the employer Kanban
 * (`/employer/jobs/[id]/ats`) but without the company gate, so an
 * admin can audit ANY application across the platform.
 *
 * Filters: company, job, stage, source, candidate email/name. URL-
 * encoded so admins can share / bookmark queries.
 *
 * Stage overrides ride the same `moveStage` server action the
 * recruiter uses — `requireEmployerForApplication` already
 * short-circuits the company check for ADMIN role, so the audit
 * log and notification fan-out are identical.
 */
export default async function AdminApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    company?: string;
    job?: string;
    stage?: string;
    q?: string;
    page?: string;
  }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const sp = await searchParams;

  const companyId = sp.company?.trim() || "";
  const jobId = sp.job?.trim() || "";
  const stage =
    sp.stage && (Object.values(ApplicationStage) as string[]).includes(sp.stage)
      ? (sp.stage as ApplicationStage)
      : null;
  const q = sp.q?.trim() ?? "";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  // ─── Filter-source lookups (kept cheap) ─────────────────────
  const [companies, jobs] = await Promise.all([
    // Top 200 companies that have at least one application — keeps
    // the dropdown short. Searching for a missing one is acceptable
    // via the candidate-name search anyway.
    db.company.findMany({
      where: { jobs: { some: { applications: { some: {} } } } },
      orderBy: { name: "asc" },
      take: 200,
      select: { id: true, name: true },
    }),
    companyId
      ? db.jobPosting.findMany({
          where: { companyId },
          orderBy: { createdAt: "desc" },
          take: 200,
          select: { id: true, title: true },
        })
      : [],
  ]);

  // ─── Build the WHERE clause once. ───────────────────────────
  const where = {
    ...(companyId ? { job: { companyId } } : {}),
    ...(jobId ? { jobId } : {}),
    ...(stage ? { stage } : {}),
    ...(q
      ? {
          OR: [
            { candidate: { firstName: { contains: q, mode: "insensitive" as const } } },
            { candidate: { lastName: { contains: q, mode: "insensitive" as const } } },
            { candidate: { user: { email: { contains: q, mode: "insensitive" as const } } } },
            { job: { title: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [total, applications] = await Promise.all([
    db.application.count({ where }),
    db.application.findMany({
      where,
      orderBy: { appliedAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: {
        candidate: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            slug: true,
            profilePhotoUrl: true,
            headline: true,
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
    }),
  ]);

  // KPI band — five small per-stage counts for the active filter
  // set (excluding stage), so the admin sees the funnel for the
  // currently-filtered company/job.
  const { stage: _ignoredStage, ...kpiWhere } = where;
  const stageCounts = await db.application.groupBy({
    by: ["stage"],
    where: kpiWhere,
    _count: { _all: true },
  });
  const countByStage = new Map<ApplicationStage, number>();
  for (const row of stageCounts) countByStage.set(row.stage, row._count._all);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <AdminShell>
      <div className="container max-w-7xl space-y-6 py-6 md:py-8">
        <ToastFromSearchParams />
        <PageHeader
          eyebrow="ATS · cross-company"
          title="Applications"
          subtitle={`${total.toLocaleString("en-IN")} applications match this filter · showing page ${page} of ${totalPages}`}
        />

        {/* Stage KPIs */}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
          {(Object.values(ApplicationStage) as ApplicationStage[]).map((s) => (
            <Link
              key={s}
              href={
                `/admin/applications?stage=${s}` +
                (companyId ? `&company=${companyId}` : "") +
                (jobId ? `&job=${jobId}` : "") +
                (q ? `&q=${encodeURIComponent(q)}` : "")
              }
              className={`block rounded-md border p-2 text-center text-xs hover:border-emce-mid ${
                stage === s
                  ? "border-emce-dark bg-emce-light-soft font-bold text-emce-darkest"
                  : "border-emce-border bg-white text-emce-text-sec"
              }`}
            >
              <span className="block tabular-nums">
                {(countByStage.get(s) ?? 0).toLocaleString("en-IN")}
              </span>
              <span className="block text-[10px] uppercase tracking-wide">
                {s.toLowerCase()}
              </span>
            </Link>
          ))}
        </div>

        {/* Filter bar */}
        <Card className="p-4">
          <form
            action="/admin/applications"
            method="get"
            className="grid gap-3 sm:grid-cols-4"
          >
            <div>
              <Label htmlFor="company">Company</Label>
              <NativeSelect id="company" name="company" defaultValue={companyId}>
                <option value="">All companies</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div>
              <Label htmlFor="job">Job</Label>
              <NativeSelect
                id="job"
                name="job"
                defaultValue={jobId}
                disabled={!companyId}
              >
                <option value="">{companyId ? "All jobs" : "Pick a company first"}</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div>
              <Label htmlFor="stage">Stage</Label>
              <NativeSelect id="stage" name="stage" defaultValue={stage ?? ""}>
                <option value="">Any stage</option>
                {(Object.values(ApplicationStage) as ApplicationStage[]).map((s) => (
                  <option key={s} value={s}>
                    {s.toLowerCase()}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div>
              <Label htmlFor="q">Candidate / job search</Label>
              <Input
                id="q"
                name="q"
                defaultValue={q}
                placeholder="John, john@…, Battery engineer"
                maxLength={120}
              />
            </div>
            <div className="sm:col-span-4 flex flex-wrap items-center justify-end gap-3">
              {(companyId || jobId || stage || q) && (
                <Link
                  href="/admin/applications"
                  className="text-hint font-bold text-emce-text-sec hover:text-emce-dark"
                >
                  Clear
                </Link>
              )}
              <SubmitButton size="sm" variant="outline">Apply</SubmitButton>
            </div>
          </form>
        </Card>

        {/* Application list */}
        {applications.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="text-body text-emce-text-sec">
              No applications match this filter.
            </p>
          </Card>
        ) : (
          <Card className="overflow-hidden p-0">
            <ul className="divide-y divide-emce-border">
              {applications.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-3 p-3 hover:bg-emce-light-soft">
                  <Avatar
                    src={a.candidate.profilePhotoUrl}
                    name={`${a.candidate.firstName} ${a.candidate.lastName ?? ""}`}
                    size="sm"
                    className="h-10 w-10 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <Link
                        href={`/${a.candidate.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate text-sm font-bold text-emce-text hover:underline"
                      >
                        {a.candidate.firstName} {a.candidate.lastName ?? ""}
                      </Link>
                      <span className="text-hint text-emce-text-muted">
                        {a.candidate.user.email}
                      </span>
                    </div>
                    <p className="line-clamp-1 text-hint text-emce-text-sec">
                      <Link
                        href={`/jobs/${a.job.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-bold text-emce-dark hover:underline"
                      >
                        {a.job.title}
                      </Link>{" "}
                      ·{" "}
                      <Link
                        href={`/company/${a.job.company.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        {a.job.company.name}
                      </Link>
                    </p>
                    {a.candidate.headline && (
                      <p className="line-clamp-1 text-[10px] text-emce-text-muted">
                        {a.candidate.headline}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant={STAGE_TONE[a.stage]} size="sm">
                      {a.stage.toLowerCase()}
                    </Badge>
                    <p className="text-[10px] text-emce-text-muted">
                      {relativeTime(a.appliedAt)}
                    </p>
                  </div>

                  {/* Admin override — stage move. Bypasses the
                      company gate via the existing
                      requireEmployerForApplication ADMIN bypass. */}
                  <form
                    action={moveStage}
                    className="flex items-center gap-2"
                  >
                    <input type="hidden" name="applicationId" value={a.id} />
                    <NativeSelect
                      name="toStage"
                      defaultValue={a.stage}
                      className="w-32 text-xs"
                    >
                      {(Object.values(ApplicationStage) as ApplicationStage[]).map((s) => (
                        <option key={s} value={s}>
                          {s.toLowerCase()}
                        </option>
                      ))}
                    </NativeSelect>
                    <ConfirmSubmit
                      size="sm"
                      variant="outline"
                      confirm="Override application stage on behalf of recruiter? Candidate will be notified."
                      pendingLabel="…"
                    >
                      Move
                    </ConfirmSubmit>
                  </form>

                  <Link
                    href={`/employer/applications/${a.id}`}
                    className="text-hint font-bold text-emce-dark hover:underline"
                  >
                    Open →
                  </Link>
                </li>
              ))}
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
                    "/admin/applications?page=" +
                    (page - 1) +
                    (companyId ? `&company=${companyId}` : "") +
                    (jobId ? `&job=${jobId}` : "") +
                    (stage ? `&stage=${stage}` : "") +
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
                    "/admin/applications?page=" +
                    (page + 1) +
                    (companyId ? `&company=${companyId}` : "") +
                    (jobId ? `&job=${jobId}` : "") +
                    (stage ? `&stage=${stage}` : "") +
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
