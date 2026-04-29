import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AdminShell } from "@/components/layout/admin-shell";
import { PageHeader, SectionTitle } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { approveSalary, rejectSalary } from "@/server/salaries/actions";
import { formatLakhs } from "@/lib/salary-compass";
import { relativeTime } from "@/lib/utils";

export const metadata = { title: "Salary moderation" };

/**
 * Admin moderation queue for the public Salary Compass. Pending
 * submissions sit here until an ADMIN approves (publishes to the
 * aggregates) or rejects (excluded from all queries). Recent decisions
 * show below for a quick "did I just approve a duplicate" check.
 */
export default async function AdminSalariesPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");

  const [pending, recent] = await Promise.all([
    db.salarySubmission.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: 100,
      include: {
        company: { select: { name: true, logoUrl: true, slug: true } },
        evDomain: { select: { name: true } },
      },
    }),
    db.salarySubmission.findMany({
      where: { status: { in: ["APPROVED", "REJECTED"] } },
      orderBy: { reviewedAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <AdminShell>
      <div className="container max-w-5xl space-y-6 py-10">
        <PageHeader
          eyebrow="Trust"
          title="Salary moderation"
          subtitle="Anonymous, crowd-sourced India EV salary submissions. Approve to publish to the public Compass, reject to drop."
          actions={<Badge variant="outline">{pending.length} pending</Badge>}
        />

        <Card>
          <SectionTitle title="Pending submissions" />
          {pending.length === 0 ? (
            <div className="mt-3">
              <EmptyState
                icon="✓"
                title="Inbox zero"
                body="No salary submissions waiting for review. New ones land here as visitors submit."
              />
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-emce-border">
              {pending.map((s) => (
                <li key={s.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-emce-text">{s.companyName}</span>
                      {s.companyId && (
                        <Badge variant="success" className="text-[10px]">✓ Linked</Badge>
                      )}
                      <span className="text-emce-text-sec">·</span>
                      <span className="font-bold text-emce-text">{s.jobTitle}</span>
                    </div>
                    <p className="text-hint text-emce-text-sec">
                      {s.profileMode} · {s.yearsExp} yrs
                      {s.location ? ` · ${s.location}` : ""}
                      {s.evDomain ? ` · ${s.evDomain.name}` : ""}
                      {s.submittedByUserId ? " · attributed" : " · anonymous"}
                    </p>
                    <p className="mt-1 text-2xl font-extrabold text-emce-text">
                      {formatLakhs(s.ctcLakhs)}
                      <span className="ml-2 text-hint font-normal text-emce-text-sec">
                        {[
                          s.baseLakhs ? `base ${formatLakhs(s.baseLakhs)}` : null,
                          s.bonusLakhs ? `bonus ${formatLakhs(s.bonusLakhs)}` : null,
                          s.esopLakhs ? `esop ${formatLakhs(s.esopLakhs)}` : null,
                        ].filter(Boolean).join(" · ")}
                      </span>
                    </p>
                    <p className="mt-1 text-hint text-emce-text-muted">
                      Submitted {relativeTime(s.createdAt)}
                      {s.ip ? ` · ip ${s.ip}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <form action={approveSalary}>
                      <input type="hidden" name="id" value={s.id} />
                      <Button type="submit" size="sm">✓ Approve</Button>
                    </form>
                    <form action={rejectSalary}>
                      <input type="hidden" name="id" value={s.id} />
                      <Button type="submit" size="sm" variant="ghost">Reject</Button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {recent.length > 0 && (
          <Card>
            <SectionTitle title="Recent decisions" />
            <ul className="mt-3 space-y-1.5">
              {recent.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">
                    <span className="font-bold text-emce-text">{s.jobTitle}</span> at{" "}
                    <span className="text-emce-text-sec">{s.companyName}</span> ·{" "}
                    {formatLakhs(s.ctcLakhs)}
                  </span>
                  <Badge
                    variant={s.status === "APPROVED" ? "success" : "danger"}
                    className="text-[10px]"
                  >
                    {s.status}
                  </Badge>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </AdminShell>
  );
}
