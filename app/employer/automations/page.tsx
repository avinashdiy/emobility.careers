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
import { EmployerShell } from "@/components/layout/employer-shell";
import { AutomationForm } from "@/components/employer/AutomationForm";
import { toggleAutomation, deleteAutomation } from "@/server/automations/actions";

export const metadata = { title: "Pipeline automations" };

/**
 * #23 Automation Rules — company-wide list + create form. Per-job
 * scoped automations live at `/employer/jobs/[id]/automations`, but
 * this is the "central inbox" for every rule the recruiter owns.
 */
export default async function AutomationsPage() {
  const session = await auth();
  if (!session?.user) redirect(await signinNextUrl());
  const employer = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
    include: { company: { select: { id: true, name: true } } },
  });
  if (!employer) redirect("/employer/onboarding");
  if (!employer.isCompanyAdmin && session.user.role !== "ADMIN") redirect("/403");

  const [rules, jobs] = await Promise.all([
    db.pipelineAutomation.findMany({
      where: { companyId: employer.companyId },
      orderBy: { createdAt: "desc" },
      include: {
        job: { select: { id: true, title: true, slug: true } },
        _count: { select: { logs: true } },
      },
    }),
    db.jobPosting.findMany({
      where: { companyId: employer.companyId, status: { in: ["OPEN", "DRAFT", "PAUSED"] } },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, status: true },
    }),
  ]);

  return (
    <EmployerShell>
      <div className="container max-w-5xl space-y-6 py-10">
        <PageHeader
          eyebrow="Recruiter superpowers"
          title="Pipeline automations"
          accent="automations"
          subtitle="If-this-then-that for your hiring pipeline. Auto-shortlist top matches, auto-reject when criteria are clearly missed, ping the team when something's special."
        />

        <Card>
          <h2 className="text-section text-emce-text">Create a new rule</h2>
          <p className="mt-1 text-hint text-emce-text-sec">
            Each rule fires on a trigger (a new application, a stage change),
            evaluates conditions, and runs one action.
          </p>
          <div className="mt-4">
            <AutomationForm jobs={jobs} />
          </div>
        </Card>

        <div>
          <h2 className="text-section text-emce-text">Your rules</h2>
          {rules.length === 0 ? (
            <EmptyState
              variant="mesh"
              icon="⚡"
              title="No rules yet"
              body="Create your first rule above — common starters: auto-shortlist 80%+ matches who hold ARAI, or auto-reject below-3-years experience on senior roles."
              className="mt-3"
            />
          ) : (
            <ul className="emce-stagger mt-3 space-y-3">
              {rules.map((r) => (
                <li key={r.id}>
                  <RuleCard rule={r} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </EmployerShell>
  );
}

function RuleCard({
  rule,
}: {
  rule: {
    id: string;
    label: string;
    enabled: boolean;
    trigger: "APPLICATION_RECEIVED" | "STAGE_CHANGED";
    action: string;
    runCount: number;
    lastRunAt: Date | null;
    job: { id: string; title: string; slug: string } | null;
    _count: { logs: number };
  };
}) {
  return (
    <Card variant="interactive">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <Badge variant={rule.enabled ? "live" : "outline"}>
              {rule.enabled ? "Active" : "Paused"}
            </Badge>
            <span className="text-hint text-emce-text-sec">
              {rule.trigger === "APPLICATION_RECEIVED" ? "On new application" : "On stage change"}
            </span>
            <span className="text-hint text-emce-text-muted">→</span>
            <span className="text-hint text-emce-text-sec">
              {rule.action.replace(/_/g, " ").toLowerCase()}
            </span>
          </div>
          <p className="mt-1 font-bold text-emce-text">{rule.label}</p>
          <p className="mt-1 text-hint text-emce-text-muted">
            Scope:{" "}
            {rule.job ? (
              <Link
                href={`/employer/jobs/${rule.job.id}`}
                className="font-bold text-emce-dark hover:underline"
              >
                {rule.job.title}
              </Link>
            ) : (
              <span>Company-wide</span>
            )}{" "}
            · Fired {rule.runCount} time{rule.runCount === 1 ? "" : "s"} · Evaluated {rule._count.logs} time{rule._count.logs === 1 ? "" : "s"}
            {rule.lastRunAt && (
              <> · Last fired {new Date(rule.lastRunAt).toLocaleDateString("en-IN")}</>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form action={toggleAutomation}>
            <input type="hidden" name="ruleId" value={rule.id} />
            <input type="hidden" name="enabled" value={String(!rule.enabled)} />
            <Button type="submit" variant="outline" size="sm">
              {rule.enabled ? "Pause" : "Resume"}
            </Button>
          </form>
          <form action={deleteAutomation}>
            <input type="hidden" name="ruleId" value={rule.id} />
            <Button type="submit" variant="ghost" size="sm">
              Delete
            </Button>
          </form>
        </div>
      </div>
    </Card>
  );
}
