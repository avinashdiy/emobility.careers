import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { AIProgress } from "@/components/ui/ai-progress";
import { EmployerShell } from "@/components/layout/employer-shell";
import {
  saveHiringAssistantConfig,
  runHiringAssistantNow,
} from "@/server/hiring-assistant/actions";

export const metadata = { title: "AI Hiring Assistant" };

/**
 * #22 AI Hiring Assistant — per-job configuration + recent run
 * summaries. The agentic loop's daily "your assistant did X"
 * notification links here; this is also where the recruiter
 * enables / pauses / runs-now.
 */
export default async function HiringAssistantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/signin?next=/employer/jobs/${id}/assistant`);
  const employer = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!employer) redirect("/employer/onboarding");

  const job = await db.jobPosting.findUnique({
    where: { id },
    include: {
      hiringAssistant: { include: { runs: { take: 8, orderBy: { startedAt: "desc" } } } },
      _count: { select: { applications: true } },
    },
  });
  if (!job || job.companyId !== employer.companyId) notFound();

  const config = job.hiringAssistant;
  const lastRun = config?.runs?.[0] ?? null;

  return (
    <EmployerShell>
      <div className="container max-w-4xl space-y-6 py-10">
        <header className="animate-fade-up">
          <Link
            href={`/employer/jobs/${id}`}
            className="text-hint font-bold text-emce-text-sec hover:text-emce-dark"
          >
            ← Job detail
          </Link>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emce-mid-muted">
            🤖 AI Hiring Assistant
          </p>
          <h1 className="mt-1 text-2xl font-extrabold leading-tight tracking-tight text-emce-text md:text-[32px]">
            {job.title}
          </h1>
          <p className="mt-2 text-hint text-emce-text-sec">
            The assistant ranks fresh applications by match score + verified
            skills, drafts a personalised first-touch outreach for the top
            candidates, and chases non-responders after a configurable wait.
            All actions audit-logged. You can pause it any time.
          </p>
        </header>

        {/* Quick status + run-now */}
        <Card variant={config?.enabled ? "glow" : "default"} animate>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-2">
              <Badge variant={config?.enabled ? "live" : "outline"}>
                {config?.enabled ? "Active" : "Off"}
              </Badge>
              {config?.tone && (
                <Badge variant="default" size="sm">
                  Tone: {config.tone}
                </Badge>
              )}
              <span className="text-hint text-emce-text-sec">
                {job._count.applications} application{job._count.applications === 1 ? "" : "s"} on this job
              </span>
            </div>
            {config?.enabled && (
              <form action={runHiringAssistantNow} className="flex flex-col items-end gap-2">
                <input type="hidden" name="jobId" value={id} />
                <SubmitButton variant="glow" size="sm" pendingLabel="Running…">
                  ⚡ Run now
                </SubmitButton>
                {/* 3000ms beat — the agentic loop is the slowest AI
                    surface (ranking + drafting + chasing) so the
                    progress feels real rather than racing the spinner. */}
                <AIProgress
                  steps={["Ranking applications", "Drafting outreach", "Sending"]}
                  stepMs={3000}
                />
              </form>
            )}
          </div>
          {lastRun && (
            <p className="mt-3 text-body text-emce-text">
              <span className="font-bold">Last run</span> ·{" "}
              {new Date(lastRun.startedAt).toLocaleString("en-IN")} ·{" "}
              {lastRun.status === "SUCCESS" ? "✓" : lastRun.status}
            </p>
          )}
          {lastRun?.summary && (
            <p className="mt-2 text-body text-emce-text-sec">{lastRun.summary}</p>
          )}
        </Card>

        {/* Config form */}
        <Card>
          <h2 className="text-section text-emce-text">Settings</h2>
          <p className="mt-1 text-hint text-emce-text-sec">
            Tune the assistant&apos;s cadence + tone. Lower batch sizes feel more
            curated to candidates; higher batch sizes keep the funnel warm.
          </p>
          <form action={saveHiringAssistantConfig} className="mt-4 grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="jobId" value={id} />
            <label className="sm:col-span-2 flex items-center gap-2 rounded-md bg-emce-light-soft p-3 text-hint font-bold text-emce-text">
              <input
                type="checkbox"
                name="enabled"
                value="true"
                defaultChecked={config?.enabled ?? true}
                className="h-4 w-4 accent-emce-mid"
              />
              Enable the AI Hiring Assistant for this job
            </label>

            <div>
              <Label htmlFor="draftBatchSize">Outreach drafts per run</Label>
              <Input
                id="draftBatchSize"
                name="draftBatchSize"
                type="number"
                min="1"
                max="20"
                defaultValue={config?.draftBatchSize ?? 5}
              />
              <p className="mt-1 text-hint text-emce-text-muted">
                How many top candidates the assistant messages on each run.
              </p>
            </div>

            <div>
              <Label htmlFor="followUpAfterDays">Chase after (days)</Label>
              <Input
                id="followUpAfterDays"
                name="followUpAfterDays"
                type="number"
                min="0"
                max="30"
                defaultValue={config?.followUpAfterDays ?? 4}
              />
              <p className="mt-1 text-hint text-emce-text-muted">
                Send a gentle follow-up to non-responders after N days. Set
                to 0 to disable chasing.
              </p>
            </div>

            <div>
              <Label htmlFor="tone">Tone</Label>
              <NativeSelect id="tone" name="tone" defaultValue={config?.tone ?? "WARM"}>
                <option value="FORMAL">Formal</option>
                <option value="WARM">Warm (default)</option>
                <option value="CASUAL">Casual</option>
              </NativeSelect>
            </div>

            <div>
              <Label htmlFor="maxOutreachPerTick">Max messages per run</Label>
              <Input
                id="maxOutreachPerTick"
                name="maxOutreachPerTick"
                type="number"
                min="1"
                max="30"
                defaultValue={config?.maxOutreachPerTick ?? 10}
              />
              <p className="mt-1 text-hint text-emce-text-muted">
                Hard cost ceiling — combined drafts + chases never exceed this.
              </p>
            </div>

            <div className="sm:col-span-2 flex justify-end">
              <SubmitButton pendingLabel="Saving…">Save settings</SubmitButton>
            </div>
          </form>
        </Card>

        {/* Run history */}
        {config?.runs && config.runs.length > 0 && (
          <Card>
            <h2 className="text-section text-emce-text">Recent runs</h2>
            <ul className="emce-stagger mt-3 divide-y divide-emce-border">
              {config.runs.map((r) => (
                <li key={r.id} className="py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-bold text-emce-text">
                      {new Date(r.startedAt).toLocaleString("en-IN")}
                    </p>
                    <Badge variant={r.status === "SUCCESS" ? "success" : r.status === "FAILED" ? "danger" : "default"}>
                      {r.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-hint text-emce-text-sec">
                    Ranked {r.rankedCount} · Drafted {r.draftedCount} · Chased {r.chasedCount} · {r.tokensUsed} tokens
                  </p>
                  {r.summary && <p className="mt-1 text-body text-emce-text">{r.summary}</p>}
                  {r.errorMessage && (
                    <p className="mt-1 text-hint text-emce-red-deep">{r.errorMessage}</p>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </EmployerShell>
  );
}
