import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { recalcCompleteness, nextSteps } from "@/lib/profile-completeness";
import { uploadAndParseResume } from "@/server/candidates/actions";
import { saveOnboardingBasics } from "@/server/recruitathon/onboarding-actions";

/**
 * Recruitathon test onboarding — the "next, next → Start test" flow.
 *
 * Gate: a candidate must reach ≥50% profile completeness (the platform
 * EXPLORE threshold) AND have a CV on file before the proctored test
 * unlocks. The stepper leans on the CV upload's AI autofill to do most
 * of the work in one step, then fills the cheapest remaining gaps, and
 * reveals the Start-test button the moment the gate clears.
 */
export const dynamic = "force-dynamic";

const STEP_GATE = 50;

export default async function RecruitathonOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/recruitathon/") && !sp.next.startsWith("//") ? sp.next : null;
  const backTo = `/recruitathon/onboarding${next ? `?next=${encodeURIComponent(next)}` : ""}`;

  const session = await auth();
  if (!session?.user) {
    redirect(`/signup?next=${encodeURIComponent(backTo)}`);
  }

  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
    select: { resumeUrl: true, headline: true, location: true, summary: true },
  });
  // Not a candidate (e.g. employer account) — send to the generic
  // role-aware onboarding rather than dead-ending here.
  if (!profile) redirect("/onboarding");

  const completeness = await recalcCompleteness(session.user.id);
  const pct = completeness.pct;
  const hasCV = !!profile.resumeUrl;
  const ready = pct >= STEP_GATE && hasCV;

  // Which step to show.
  const step: "cv" | "basics" | "gaps" | "ready" =
    ready ? "ready"
    : !hasCV ? "cv"
    : (!profile.headline || !profile.location) ? "basics"
    : "gaps";

  const startHref = next ?? "/recruitathon/select";
  const stepNo = step === "cv" ? 1 : step === "ready" ? 3 : 2;

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-emce-light-bg">
        <div className="container max-w-2xl py-8 md:py-12">
          <p className="text-hint font-bold uppercase tracking-wide text-emce-mid-muted">Recruitathon test · getting you ready</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-emce-text md:text-3xl">
            {ready ? "You're ready to start" : "A couple of quick steps first"}
          </h1>

          {/* Step indicator */}
          <div className="mt-4 flex items-center gap-2 text-xs font-bold">
            {[
              { n: 1, label: "Upload CV" },
              { n: 2, label: "Complete profile" },
              { n: 3, label: "Start test" },
            ].map((s, i) => (
              <span key={s.n} className="flex items-center gap-2">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full ${stepNo >= s.n ? "bg-emce-dark text-emce-light" : "bg-emce-light-soft text-emce-text-sec"}`}>
                  {stepNo > s.n ? "✓" : s.n}
                </span>
                <span className={stepNo >= s.n ? "text-emce-text" : "text-emce-text-muted"}>{s.label}</span>
                {i < 2 && <span className="mx-1 text-emce-text-muted">→</span>}
              </span>
            ))}
          </div>

          {/* Completeness gauge */}
          <Card className="mt-5 p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-emce-text">Profile completeness</p>
              <p className="text-sm font-extrabold text-emce-dark">{pct}%</p>
            </div>
            <div className="relative mt-2 h-3 overflow-hidden rounded-full bg-emce-light-soft">
              <div className="h-full rounded-full bg-emce-mid transition-all" style={{ width: `${Math.min(100, pct)}%` }} />
              {/* 50% gate marker */}
              <span className="absolute top-0 h-full w-0.5 bg-emce-dark/50" style={{ left: `${STEP_GATE}%` }} aria-hidden />
            </div>
            <p className="mt-1.5 text-hint text-emce-text-sec">
              {ready ? "You've cleared the bar. " : `Reach ${STEP_GATE}% + a CV to unlock the test. `}
              {hasCV ? "CV uploaded ✓" : "CV not uploaded yet"}
            </p>
          </Card>

          {sp.error && (
            <p className="mt-4 rounded-md bg-emce-red-light p-3 text-sm font-semibold text-emce-red-deep">{sp.error}</p>
          )}

          {/* ── Step content ──────────────────────────────────────── */}
          {step === "cv" && (
            <Card className="mt-4 p-6">
              <p className="text-section text-emce-text">Step 1 · Upload your CV</p>
              <p className="mt-1 text-sm text-emce-text-sec">
                Upload your resume (PDF or DOCX) — we&apos;ll read it and auto-fill your headline, experience,
                education and skills, so you clear most of the bar in one step.
              </p>
              <form action={uploadAndParseResume} className="mt-4 space-y-3">
                <input type="hidden" name="redirectTo" value={backTo} />
                <input
                  type="file"
                  name="resume"
                  accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  required
                  className="block w-full text-sm text-emce-text-sec file:mr-3 file:rounded-md file:border-0 file:bg-emce-dark file:px-4 file:py-2 file:text-sm file:font-bold file:text-emce-light hover:file:bg-emce-darkest"
                />
                <Button type="submit" size="lg">Upload &amp; auto-fill →</Button>
              </form>
            </Card>
          )}

          {step === "basics" && (
            <Card className="mt-4 p-6">
              <p className="text-section text-emce-text">Step 2 · The basics</p>
              <p className="mt-1 text-sm text-emce-text-sec">Two quick fields and you&apos;re almost there.</p>
              <form action={saveOnboardingBasics} className="mt-4 space-y-3">
                {next && <input type="hidden" name="next" value={next} />}
                <div>
                  <label className="text-hint font-bold text-emce-text-sec">Headline</label>
                  <input name="headline" required minLength={10} maxLength={140} defaultValue={profile.headline ?? ""} placeholder="e.g. EV Battery Engineer · B.Tech Mechanical · Pune" className="mt-1 w-full rounded-md border border-emce-border p-2.5 text-sm" />
                </div>
                <div>
                  <label className="text-hint font-bold text-emce-text-sec">Current city</label>
                  <input name="location" required minLength={2} maxLength={120} defaultValue={profile.location ?? ""} placeholder="e.g. Pune, Maharashtra" className="mt-1 w-full rounded-md border border-emce-border p-2.5 text-sm" />
                </div>
                <div>
                  <label className="text-hint font-bold text-emce-text-sec">Short summary <span className="font-normal">(optional)</span></label>
                  <textarea name="summary" maxLength={2000} rows={3} defaultValue={profile.summary ?? ""} placeholder="A line or two about your EV interest and goals." className="mt-1 w-full rounded-md border border-emce-border p-2.5 text-sm" />
                </div>
                <Button type="submit" size="lg">Save &amp; continue →</Button>
              </form>
            </Card>
          )}

          {step === "gaps" && (
            <Card className="mt-4 p-6">
              <p className="text-section text-emce-text">Step 2 · A few more details</p>
              <p className="mt-1 text-sm text-emce-text-sec">
                You&apos;re at {pct}%. Add any of these to reach {STEP_GATE}% — each opens your profile editor in a new tab.
              </p>
              <ul className="mt-3 space-y-2">
                {nextSteps(completeness, 5).map((s) => (
                  <li key={s.id}>
                    <a href={s.href} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-3 rounded-md border border-emce-border bg-white p-3 text-sm transition hover:border-emce-mid">
                      <span className="font-semibold text-emce-text">{s.label}</span>
                      <span className="shrink-0 text-hint font-bold text-emce-dark">+{s.weight}% →</span>
                    </a>
                  </li>
                ))}
              </ul>
              <Button asChild className="mt-4" variant="outline"><Link href={backTo}>I&apos;ve updated — refresh</Link></Button>
            </Card>
          )}

          {step === "ready" && (
            <Card className="mt-4 border-2 border-emce-mid bg-emce-light-soft p-6 text-center">
              <p className="text-4xl">🎯</p>
              <p className="mt-2 text-section text-emce-text">Everything&apos;s set</p>
              <p className="mt-1 text-sm text-emce-text-sec">Your profile is {pct}% complete with a CV on file. Time to take the test.</p>
              <Button asChild size="lg" className="mt-4"><Link href={startHref}>Start the test →</Link></Button>
            </Card>
          )}

          <p className="mt-6 text-center text-hint text-emce-text-muted">
            You can polish your full profile any time at{" "}
            <Link href="/me/profile" className="font-bold text-emce-dark hover:underline">your profile</Link>.
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
