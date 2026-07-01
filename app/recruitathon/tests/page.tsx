import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";

/**
 * Test overview — the candidate's chosen JDs and the status of each
 * proctored test (start / resume / view result), plus a "prepping"
 * state for JDs whose question bank isn't wired yet (pre-Batch-3c).
 * The cross-JD aggregate report lands in Batch 4.
 */
export const dynamic = "force-dynamic";

const LEVEL_LABEL: Record<string, string> = { BASIC: "ITI / Diploma", INTERMEDIATE: "Diploma / Grad", ADVANCED: "Graduate / Exp" };

export default async function RecruitathonTestsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const sp = await searchParams;
  const session = await auth();
  if (!session?.user) redirect("/recruitathon/select");
  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!profile) redirect("/recruitathon/onboarding");

  const selections = await db.recruitathonJdSelection.findMany({
    where: { candidateId: profile.id },
    orderBy: { createdAt: "asc" },
    include: {
      jd: {
        select: {
          id: true, company: true, role: true, level: true, eligibility: true,
          assessment: { select: { id: true, durationMins: true, skillMeta: { select: { slug: true } } } },
        },
      },
    },
  });
  if (selections.length === 0) redirect("/recruitathon/select");

  // Any attempts the candidate already has for these JDs' assessments.
  const assessmentIds = selections.map((s) => s.jd.assessment?.id).filter(Boolean) as string[];
  const attempts = assessmentIds.length
    ? await db.assessmentAttempt.findMany({
        where: { candidateId: profile.id, assessmentId: { in: assessmentIds } },
        select: { id: true, assessmentId: true, submittedAt: true, score: true },
      })
    : [];
  const attemptByAssessment = new Map(attempts.map((a) => [a.assessmentId, a]));

  const done = selections.filter((s) => s.jd.assessment && attemptByAssessment.get(s.jd.assessment.id)?.submittedAt).length;

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-emce-light-bg">
        <div className="container max-w-2xl py-8 md:py-10">
          <p className="text-hint font-bold uppercase tracking-wide text-emce-mid-muted">Your Recruitathon tests</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-emce-text md:text-3xl">
            {done === selections.length ? "All tests complete" : `${done} of ${selections.length} done`}
          </h1>
          <p className="mt-2 text-sm text-emce-text-sec">
            One proctored test per role you selected. Take them one at a time — each opens in full-screen.
            <Link href="/recruitathon/select" className="ml-1 font-bold text-emce-dark hover:underline">Change selection</Link>.
          </p>

          {sp.notice && (
            <p className="mt-4 rounded-md bg-emce-orange-light p-3 text-sm font-semibold text-emce-orange-deep">
              {sp.notice}
            </p>
          )}

          <ul className="mt-5 space-y-3">
            {selections.map((s) => {
              const jd = s.jd;
              const assessment = jd.assessment;
              const attempt = assessment ? attemptByAssessment.get(assessment.id) : null;
              const slug = assessment?.skillMeta?.slug;
              return (
                <li key={s.id}>
                  <Card className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-emce-text">{jd.role}</p>
                        <p className="text-hint text-emce-text-sec">
                          {jd.company} · {jd.eligibility ?? LEVEL_LABEL[jd.level]}
                          {s.matchScore != null && <span className="font-bold text-emce-dark"> · {s.matchScore}% match</span>}
                        </p>
                      </div>
                      <div className="shrink-0">
                        {attempt?.submittedAt ? (
                          <Button asChild variant="outline" size="sm"><Link href={`/recruitathon/exam/${attempt.id}/result`}>Result: {attempt.score}%</Link></Button>
                        ) : assessment && slug ? (
                          <Button asChild size="sm"><Link href={`/recruitathon/test/${slug}`}>{attempt ? "Resume →" : "Start test →"}</Link></Button>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-emce-light-soft px-3 py-1 text-xs font-bold text-emce-text-sec">Test being prepared</span>
                        )}
                      </div>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>

          {selections.some((s) => !s.jd.assessment) && (
            <p className="mt-4 rounded-md bg-emce-light-soft p-3 text-hint text-emce-text-sec">
              Some question banks are still being finalised — you&apos;ll be able to start those shortly. Come back to this page any time.
            </p>
          )}

          {done === selections.length && (
            <Card className="mt-5 border-2 border-emce-mid bg-emce-light-soft p-5 text-center">
              <p className="text-2xl">🎉</p>
              <p className="mt-1 text-section text-emce-text">You&apos;re all done</p>
              <p className="mt-1 text-sm text-emce-text-sec">
                Thanks for completing your Recruitathon test{selections.length === 1 ? "" : "s"}. Shortlisted candidates
                are contacted by the companies directly — keep your profile up to date so they can reach you.
              </p>
              <Button asChild className="mt-3" variant="outline"><Link href="/me/profile">Review my profile →</Link></Button>
            </Card>
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
