import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { StartExamButton } from "@/components/recruitathon/StartExamButton";

/**
 * Pre-test instructions + start gate for one Recruitathon assessment
 * (keyed by its SkillAssessmentMeta slug). Fronted by the CV-upload
 * onboarding; the only requirement to start is a CV on file.
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
    ? await db.candidateProfile.findUnique({ where: { userId: session.user.id }, select: { id: true, resumeUrl: true, resumeParseDraft: true, resumeParsedAt: true } })
    : null;

  // Gate: a CV on file whose details step is done (parse reviewed & applied
  // or filled manually). A pending draft or a failed parse (no
  // resumeParsedAt) still needs the candidate to confirm their details.
  const ready = Boolean(profile && profile.resumeUrl && !profile.resumeParseDraft && profile.resumeParsedAt);
  const onboardingHref = `/recruitathon/onboarding?next=${encodeURIComponent(`/recruitathon/test/${slug}`)}`;

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
              <li>• This test requires a <strong>working webcam</strong>. Keep your face in view — nothing is recorded, but looking away or others appearing is flagged for review.</li>
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
                <Link href={onboardingHref}>Get started →</Link>
              </Button>
            ) : priorAttempt?.submittedAt ? (
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-emce-text-sec">You&apos;ve already completed this test.</span>
                <Button asChild variant="outline"><Link href={`/recruitathon/exam/${priorAttempt.id}/result`}>View result →</Link></Button>
              </div>
            ) : !ready ? (
              <div>
                <p className="mb-2 text-sm font-semibold text-emce-text-sec">
                  Upload and confirm your CV to unlock the test — we&apos;ll match you to roles in one step.
                </p>
                <Button asChild size="lg"><Link href={onboardingHref}>Upload CV to unlock →</Link></Button>
              </div>
            ) : (
              <StartExamButton slug={slug} resume={!!priorAttempt} />
            )}
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
