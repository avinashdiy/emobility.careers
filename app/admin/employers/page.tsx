import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { AdminShell } from "@/components/layout/admin-shell";
import { setCompanyVerification, deleteCompany, bulkDeleteRejectedCompanies } from "@/server/admin/actions";
import type { CompanyVerification } from "@prisma/client";
import { adminResetEmployerPassword } from "@/server/admin/recruiting-actions";

export const metadata = { title: "Employer KYC queue" };

interface ProvisionedCreds {
  email: string;
  tempPassword: string;
  userId: string;
}

const STATUS_FILTERS = ["ALL", "UNVERIFIED", "PENDING", "VERIFIED", "REJECTED"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

export default async function AdminEmployersPage({
  searchParams,
}: {
  searchParams: Promise<{
    provisioned?: string;
    error?: string;
    notice?: string;
    status?: string;
  }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const sp = await searchParams;
  const activeStatus: StatusFilter = (STATUS_FILTERS as readonly string[]).includes(
    (sp.status ?? "").toUpperCase(),
  )
    ? ((sp.status ?? "ALL").toUpperCase() as StatusFilter)
    : "ALL";

  let creds: ProvisionedCreds | null = null;
  if (sp.provisioned) {
    try {
      creds = JSON.parse(sp.provisioned) as ProvisionedCreds;
    } catch {
      creds = null;
    }
  }

  const [companies, employers, statusCounts] = await Promise.all([
    db.company.findMany({
      where:
        activeStatus === "ALL"
          ? {}
          : { verificationStatus: activeStatus as CompanyVerification },
      // When viewing a single status, sort by name. For ALL keep
      // status-grouped so admin attention items (UNVERIFIED) lead.
      orderBy:
        activeStatus === "ALL"
          ? [{ verificationStatus: "asc" }, { createdAt: "desc" }]
          : [{ name: "asc" }],
      take: 200,
      include: {
        owner: { select: { email: true, name: true } },
        _count: { select: { jobs: true, team: true } },
      },
    }),
    // Recent EmployerProfiles — surfaces freshly provisioned HR
    // accounts so admin can rotate passwords with one click if the
    // initial credentials get lost in the share channel.
    db.employerProfile.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      include: {
        user: { select: { id: true, email: true, name: true, lastLoginAt: true } },
        company: { select: { name: true, slug: true } },
      },
    }),
    // Per-status counts — drives the filter chip badges so the admin
    // can see at a glance how many rejected / pending companies need
    // attention, without paginating to find them.
    db.company.groupBy({
      by: ["verificationStatus"],
      _count: { _all: true },
    }),
  ]);

  const countByStatus = Object.fromEntries(
    statusCounts.map((s) => [s.verificationStatus, s._count._all]),
  ) as Partial<Record<CompanyVerification, number>>;
  const totalCount = statusCounts.reduce((acc, s) => acc + s._count._all, 0);

  return (
    <AdminShell>
      <div className="container max-w-5xl py-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <h1 className="text-dashboard text-emce-text">Employers / company KYC</h1>
          <Button asChild className="w-full sm:w-auto">
            <Link href="/admin/employers/new">+ Provision HR account</Link>
          </Button>
        </div>

        {sp.error && (
          <div className="mt-4 rounded-md bg-emce-red-light p-3 text-sm text-emce-red-deep">
            {sp.error}
          </div>
        )}

        {sp.notice && (
          <div className="mt-4 rounded-md border border-emce-mid bg-emce-light-soft p-3 text-sm text-emce-text">
            ✓ {sp.notice}
          </div>
        )}

        {creds && (
          <Card className="mt-4 border-2 border-emce-mid bg-emce-light-soft p-6">
            <div className="flex items-start gap-3">
              <span className="text-2xl">🔑</span>
              <div className="flex-1">
                <h2 className="text-section font-extrabold text-emce-darkest">
                  New temp password · share once
                </h2>
                <p className="mt-1 text-sm text-emce-text-sec">
                  Won&apos;t be visible again after you leave this page.
                </p>
                <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
                  <dt className="font-bold text-emce-text">Email</dt>
                  <dd className="min-w-0 break-all font-mono">{creds.email}</dd>
                  <dt className="font-bold text-emce-text">Temp password</dt>
                  <dd className="min-w-0 break-all font-mono select-all">{creds.tempPassword}</dd>
                </dl>
              </div>
            </div>
          </Card>
        )}

        <h2 className="mt-8 text-section text-emce-text">Companies</h2>

        {/* Status filter — paginates by status so REJECTED / PENDING
            rows can't get clipped past the take limit. */}
        <nav className="mt-3 flex flex-wrap gap-1 rounded-md border border-emce-border p-1">
          {STATUS_FILTERS.map((s) => {
            const count =
              s === "ALL" ? totalCount : countByStatus[s as CompanyVerification] ?? 0;
            const active = s === activeStatus;
            return (
              <Link
                key={s}
                href={s === "ALL" ? "/admin/employers" : `/admin/employers?status=${s}`}
                className={`whitespace-nowrap rounded px-3 py-1.5 text-xs font-semibold ${
                  active
                    ? "bg-emce-light-soft text-emce-darkest"
                    : "text-emce-text-sec hover:text-emce-text"
                }`}
              >
                {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
                <span className="ml-1.5 text-[10px] text-emce-text-muted">
                  {count}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Bulk-delete CTA, only when filtered to REJECTED. Skips
            companies whose jobs have applications attached so we never
            silently destroy candidate history. */}
        {activeStatus === "REJECTED" && companies.length > 0 && (
          <Card className="mt-3 border-emce-orange p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-emce-orange-deep">
                  Bulk delete rejected
                </h3>
                <p className="mt-0.5 text-hint text-emce-text-sec">
                  Permanently delete every REJECTED company that has no
                  application history. Companies whose jobs received
                  applications will be skipped — review those individually.
                </p>
              </div>
              <form action={bulkDeleteRejectedCompanies}>
                <ConfirmSubmit
                  confirm={`Permanently delete every REJECTED company that has no applications attached? This cannot be undone.`}
                  size="sm"
                  variant="destructive"
                >
                  Delete all rejected
                </ConfirmSubmit>
              </form>
            </div>
          </Card>
        )}

        <ul className="mt-6 space-y-3">
          {companies.map((c) => (
            <li key={c.id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Link href={`/company/${c.slug}`} className="font-bold text-emce-text hover:underline">
                        {c.name}
                      </Link>
                      <Badge variant={
                        c.verificationStatus === "VERIFIED" ? "success"
                        : c.verificationStatus === "PENDING" ? "warning"
                        : c.verificationStatus === "REJECTED" ? "danger"
                        : "outline"
                      }>{c.verificationStatus}</Badge>
                    </div>
                    <p className="text-hint text-emce-text-sec">
                      {c.companyType} · {c._count.jobs} jobs · {c._count.team} teammates · owner {c.owner.email}
                    </p>
                    {c.description && <p className="mt-1 text-hint text-emce-text-sec">{c.description}</p>}
                    {c.website && <p className="text-hint text-emce-text-muted">{c.website}</p>}
                    {/* Surface the rejection reason on REJECTED rows so
                        moderators can see why this was flagged. The
                        owner saw the same text via email when reject
                        landed. */}
                    {c.verificationStatus === "REJECTED" && c.rejectionReason && (
                      <div className="mt-2 rounded border border-emce-orange bg-emce-orange-light p-2 text-hint">
                        <p className="font-bold text-emce-orange-deep">Rejection reason</p>
                        <p className="mt-0.5 whitespace-pre-line text-emce-text">
                          {c.rejectionReason}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/admin/employers/${c.id}/team`}>Manage team →</Link>
                    </Button>
                    <form action={setCompanyVerification}>
                      <input type="hidden" name="companyId" value={c.id} />
                      <input type="hidden" name="status" value="VERIFIED" />
                      <Button type="submit" size="sm" disabled={c.verificationStatus === "VERIFIED"}>Verify</Button>
                    </form>
                    {/* Reject opens a small disclosure with a required
                        reason. The reason is saved to Company.rejectionReason
                        AND emailed to the company owner so they know
                        what to fix instead of being left in the dark. */}
                    {c.verificationStatus !== "REJECTED" && (
                      <details className="relative">
                        <summary className="inline-flex cursor-pointer list-none items-center justify-center rounded bg-emce-red px-3 py-1.5 text-xs font-bold text-white hover:bg-emce-red/90">
                          Reject
                        </summary>
                        <form
                          action={setCompanyVerification}
                          className="absolute right-0 top-full z-10 mt-1 w-72 rounded-md border border-emce-border bg-white p-3 shadow-emce-lg"
                        >
                          <input type="hidden" name="companyId" value={c.id} />
                          <input type="hidden" name="status" value="REJECTED" />
                          <label className="text-xs font-bold text-emce-text" htmlFor={`reason-${c.id}`}>
                            Reason (emailed to owner)
                          </label>
                          <textarea
                            id={`reason-${c.id}`}
                            name="reason"
                            required
                            minLength={10}
                            maxLength={2000}
                            rows={3}
                            placeholder={`Why is "${c.name}" being rejected? e.g. Duplicate of "Ola Electric Pvt Ltd". Description copied verbatim from Wikipedia. Website domain doesn't match company name.`}
                            className="mt-1 w-full rounded border border-emce-border bg-white p-2 text-xs text-emce-text outline-none focus:border-emce-mid"
                          />
                          <div className="mt-2 flex justify-end">
                            <Button type="submit" size="sm" variant="destructive">
                              Send rejection
                            </Button>
                          </div>
                        </form>
                      </details>
                    )}
                    {/* Permanent delete — for cleaning up duplicate /
                        spam company pages. Cascades jobs, team, events,
                        invites, follows. Refuses if any application
                        rows exist (server-side guard). */}
                    <form action={deleteCompany}>
                      <input type="hidden" name="companyId" value={c.id} />
                      <ConfirmSubmit
                        confirm={`Permanently delete "${c.name}"? This will cascade-delete ${c._count.jobs} job(s), ${c._count.team} team member(s), and any events / invites. Candidate experience entries that linked here will unlink (kept as plain text). This cannot be undone.`}
                        size="sm"
                        variant="ghost"
                        className="text-emce-orange-deep"
                      >
                        Delete
                      </ConfirmSubmit>
                    </form>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>

        <h2 className="mt-10 text-section text-emce-text">Recently provisioned employer accounts</h2>
        <p className="mt-1 text-sm text-emce-text-sec">
          {employers.length === 0
            ? "No HR accounts yet. Use ‘Provision HR account’ above to create one."
            : `${employers.length} accounts shown. Hit ‘Reset password’ if the HR can’t locate their initial credentials.`}
        </p>
        {employers.length > 0 && (
          <ul className="mt-3 space-y-2">
            {employers.map((e) => (
              <li key={e.id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-bold text-emce-text">{e.user.name ?? e.user.email}</div>
                      <p className="text-hint text-emce-text-sec">
                        <span className="font-mono">{e.user.email}</span> · {e.company.name} · {e.teamRole}
                        {e.isCompanyAdmin && " · Co-admin"}
                      </p>
                      <p className="text-hint text-emce-text-muted">
                        {e.user.lastLoginAt
                          ? `Last login ${e.user.lastLoginAt.toISOString().slice(0, 10)}`
                          : "Never logged in yet"}
                      </p>
                    </div>
                    <form action={adminResetEmployerPassword}>
                      <input type="hidden" name="userId" value={e.user.id} />
                      <ConfirmSubmit
                        confirm={`Reset password for ${e.user.email}? A fresh temp password will be generated.`}
                        size="sm"
                        variant="outline"
                      >
                        Reset password
                      </ConfirmSubmit>
                    </form>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminShell>
  );
}
