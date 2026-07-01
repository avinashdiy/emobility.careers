import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { startRecruitathonExam } from "@/server/recruitathon/exam-actions";

/**
 * Pre-test instructions + start gate for one Recruitathon assessment
 * (keyed by its SkillAssessmentMeta slug). Batch 2 will front this with
 * the ≥50%-profile + CV onboarding stepper; for now it's the direct
 * entry that proves the proctored-exam flow end to end.
 */
export const dynamic = "force-dynamic";

export default async function RecruitathonTestIntroPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const assessment = await db.assessment.findFirst({
    where: { skillMeta: { slug } },
    include: { skillMeta: true },
  });
  if (!assessment) notFound();

  const session = await auth();
  const profile = session?.user
    ? await db.candidateProfile.findUnique({ where: { userId: session.user.id }, select: { id: true } })
    : null;

  const priorAttempt = profile
    ? await db.assessmentAttempt.findFirst({
        where: { assessmentId: assessment.id, candidateId: profile.id },
        orderBy: { startedAt: "desc" },
        select: { id: true, submittedAt: true },
      })
    : null;

  const count = Array.isArray(assessment.questions) ? assessment.questions.length : 0;
  const mins = assessment.durationMins ?? 30;

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-emce-light-bg">
        <div className="container max-w-2xl py-8 md:py-12">
          <p className="text-hint font-bold uppercase tracking-wide text-emce-mid-muted">Proctored test</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-emce-text md:text-3xl">
            {assessment.title}
          </h1>
          {assessment.skillMeta?.blurb && (
            <p className="mt-2 text-sm text-emce-text-sec md:text-base">{assessment.skillMeta.blurb}</p>
          )}

          <Card className="mt-5 p-5">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div><p className="text-2xl font-extrabold text-emce-dark">{count}</p><p className="text-hint text-emce-text-sec">questions</p></div>
              <div><p className="text-2xl font-extrabold text-emce-dark">{mins}</p><p className="text-hint text-emce-text-sec">minutes</p></div>
              <div><p className="text-2xl font-extrabold text-emce-dark">{assessment.passingScore}%</p><p className="text-hint text-emce-text-sec">pass mark</p></div>
            </div>
          </Card>

          <Card className="mt-4 border-emce-orange/40 bg-emce-orange-light/50 p-5">
            <p className="text-section text-emce-text">Before you start — read carefully</p>
            <ul className="mt-2 space-y-1.5 text-sm text-emce-text-sec">
              <li>• The test opens in <strong>full-screen</strong> and the timer is server-controlled — closing the tab won&apos;t pause it.</li>
              <li>• <strong>Do not switch tabs, leave the window, or exit full-screen.</strong> Each time you do, it&apos;s recorded as a warning.</li>
              <li>• Copy, paste, right-click and developer tools are disabled.</li>
              <li>• After <strong>6 warnings</strong> the test auto-submits with whatever you&apos;ve answered.</li>
              <li>• You get <strong>one attempt</strong>. Answers autosave as you go.</li>
            </ul>
          </Card>

          <div className="mt-6">
            {!session?.user ? (
              <Button asChild size="lg">
                <Link href={`/signin?next=${encodeURIComponent(`/recruitathon/test/${slug}`)}`}>Sign in to start</Link>
              </Button>
            ) : priorAttempt?.submittedAt ? (
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-emce-text-sec">You&apos;ve already completed this test.</span>
                <Button asChild variant="outline"><Link href={`/recruitathon/exam/${priorAttempt.id}/result`}>View result →</Link></Button>
              </div>
            ) : (
              <form action={startRecruitathonExam}>
                <input type="hidden" name="assessmentSlug" value={slug} />
                <Button type="submit" size="lg">
                  {priorAttempt ? "Resume test →" : "Start test →"}
                </Button>
              </form>
            )}
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
