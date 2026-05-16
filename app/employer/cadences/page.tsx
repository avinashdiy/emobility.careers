import Link from "next/link";
import { redirect } from "next/navigation";
import { signinNextUrl } from "@/lib/auth-redirect";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { NoMessagesIllustration } from "@/components/ui/illustrations";
import { EmployerShell } from "@/components/layout/employer-shell";
import { CadenceBuilder } from "@/components/employer/CadenceBuilder";
import { toggleCadence } from "@/server/outreach/actions";

export const metadata = { title: "Outreach cadences" };

/**
 * #21 Sequenced outreach — company-wide cadence list + builder.
 * Per-job cadences also appear here; the builder lets the recruiter
 * scope a new cadence to one job or leave it company-wide.
 */
export default async function CadencesPage() {
  const session = await auth();
  if (!session?.user) redirect(await signinNextUrl());
  const employer = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!employer) redirect("/employer/onboarding");
  if (!employer.isCompanyAdmin && session.user.role !== "ADMIN") redirect("/403");

  const [cadences, jobs] = await Promise.all([
    db.outreachCadence.findMany({
      where: { companyId: employer.companyId },
      orderBy: { createdAt: "desc" },
      include: {
        job: { select: { id: true, title: true } },
        steps: { orderBy: { order: "asc" }, select: { delayDays: true } },
        _count: { select: { enrollments: true } },
      },
    }),
    db.jobPosting.findMany({
      where: {
        companyId: employer.companyId,
        status: { in: ["OPEN", "DRAFT", "PAUSED"] },
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, status: true },
    }),
  ]);

  return (
    <EmployerShell>
      <div className="container max-w-5xl space-y-6 py-10">
        <PageHeader
          eyebrow="Recruiter superpowers"
          title="Outreach cadences"
          accent="cadences"
          subtitle="Define a 2-5 step sequence — first touch, follow-up, final ping. Enrol candidates from any job's ATS or the candidate search. Non-responders auto-progress; replies pause the cadence."
        />

        <Card>
          <h2 className="text-section text-emce-text">Build a new cadence</h2>
          <p className="mt-1 text-hint text-emce-text-sec">
            Template placeholders: <code className="rounded bg-emce-light-soft px-1 py-0.5 text-[11px] font-mono">{"{{candidateFirstName}}"}</code>,{" "}
            <code className="rounded bg-emce-light-soft px-1 py-0.5 text-[11px] font-mono">{"{{jobTitle}}"}</code>,{" "}
            <code className="rounded bg-emce-light-soft px-1 py-0.5 text-[11px] font-mono">{"{{companyName}}"}</code>,{" "}
            <code className="rounded bg-emce-light-soft px-1 py-0.5 text-[11px] font-mono">{"{{recruiterName}}"}</code>,{" "}
            <code className="rounded bg-emce-light-soft px-1 py-0.5 text-[11px] font-mono">{"{{location}}"}</code>.
          </p>
          <div className="mt-4">
            <CadenceBuilder jobs={jobs} />
          </div>
        </Card>

        <div>
          <h2 className="text-section text-emce-text">Your cadences</h2>
          {cadences.length === 0 ? (
            <EmptyState
              variant="mesh"
              illustration={<NoMessagesIllustration />}
              title="No cadences yet"
              body="Common starters: 3-step (Day 0, Day 4, Day 10) cadence for senior engineers, or 2-step for high-volume technician roles."
              className="mt-3"
            />
          ) : (
            <ul className="emce-stagger mt-3 space-y-3">
              {cadences.map((c) => (
                <li key={c.id}>
                  <Card variant="interactive">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <Badge variant={c.enabled ? "live" : "outline"}>
                            {c.enabled ? "Active" : "Paused"}
                          </Badge>
                          <span className="text-hint text-emce-text-sec">
                            {c.steps.length} step{c.steps.length === 1 ? "" : "s"}: Day{" "}
                            {c.steps.map((s) => s.delayDays).join(" / Day ")}
                          </span>
                        </div>
                        <p className="mt-1 font-bold text-emce-text">{c.label}</p>
                        <p className="mt-1 text-hint text-emce-text-muted">
                          Scope:{" "}
                          {c.job ? (
                            <Link
                              href={`/employer/jobs/${c.job.id}`}
                              className="font-bold text-emce-dark hover:underline"
                            >
                              {c.job.title}
                            </Link>
                          ) : (
                            <span>Company-wide</span>
                          )}{" "}
                          · {c._count.enrollments} enrolled
                        </p>
                      </div>
                      <form action={toggleCadence}>
                        <input type="hidden" name="cadenceId" value={c.id} />
                        <input type="hidden" name="enabled" value={String(!c.enabled)} />
                        <Button type="submit" variant="outline" size="sm">
                          {c.enabled ? "Pause" : "Resume"}
                        </Button>
                      </form>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </EmployerShell>
  );
}
