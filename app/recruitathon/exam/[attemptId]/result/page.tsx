import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import type { MCQQuestion } from "@/server/assessments/actions";

/**
 * Post-submit result for one Recruitathon assessment. Shows the
 * server-graded score, pass/fail, an integrity summary, and a
 * per-question review (correct answers + explanations are only ever
 * revealed here, after submission). The downloadable candidate report
 * + cross-JD aggregate land in Batch 4.
 */
export const dynamic = "force-dynamic";

export default async function RecruitathonExamResultPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const { attemptId } = await params;
  const session = await auth();
  if (!session?.user) redirect("/signin");

  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!profile) redirect("/signin");

  const attempt = await db.assessmentAttempt.findUnique({
    where: { id: attemptId },
    include: { assessment: true },
  });
  if (!attempt || attempt.candidateId !== profile.id) notFound();
  if (!attempt.submittedAt) redirect(`/recruitathon/exam/${attempt.id}`);

  const questions = attempt.assessment.questions as unknown as MCQQuestion[];
  const answers = (attempt.answers ?? {}) as Record<number, number>;
  const score = attempt.score ?? 0;
  const passed = attempt.passed ?? false;
  const correctCount = questions.reduce((n, q, i) => (answers[i] === q.correctIndex ? n + 1 : n), 0);
  const proctor = (attempt.proctorMeta ?? {}) as { flags?: number; terminated?: boolean };
  const flags = proctor.flags ?? 0;

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-emce-light-bg">
        <div className="container max-w-3xl py-8 md:py-12">
          <p className="text-hint font-bold uppercase tracking-wide text-emce-mid-muted">Test result</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-emce-text md:text-3xl">
            {attempt.assessment.title}
          </h1>

          <Card className={`mt-5 border-2 p-6 ${passed ? "border-emce-mid bg-emce-light-soft" : "border-emce-orange/50 bg-emce-orange-light"}`}>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-emce-mid-muted">Your score</p>
                <p className="mt-1 text-5xl font-extrabold text-emce-dark">{score}%</p>
                <p className="mt-1 text-sm text-emce-text-sec">
                  {correctCount} of {questions.length} correct · pass mark {attempt.assessment.passingScore}%
                </p>
              </div>
              <span className={`rounded-full px-4 py-1.5 text-sm font-extrabold ${passed ? "bg-emce-dark text-emce-light" : "bg-emce-orange-deep text-white"}`}>
                {passed ? "Passed" : "Below pass mark"}
              </span>
            </div>
            {proctor.terminated && (
              <p className="mt-4 rounded-md bg-white/70 p-3 text-sm font-semibold text-emce-red-deep">
                🛑 This attempt was auto-submitted after repeated integrity warnings.
              </p>
            )}
            {!proctor.terminated && flags > 0 && (
              <p className="mt-4 text-hint text-emce-text-sec">Integrity flags recorded during the test: {flags}.</p>
            )}
          </Card>

          {!passed && (
            <Card className="mt-4 p-5">
              <p className="text-section text-emce-text">Close the gap</p>
              <p className="mt-1 text-sm text-emce-text-sec">
                Want to score higher and stand out to recruiters? DIYguru&apos;s AICTE-approved PG &amp; Nanodegree
                programs cover exactly these topics, hands-on.
              </p>
              <Button asChild className="mt-3" variant="outline">
                <a href="https://diyguru.org/courses" target="_blank" rel="noopener noreferrer">Explore DIYguru programs →</a>
              </Button>
            </Card>
          )}

          <h2 className="mt-8 text-section text-emce-text">Review</h2>
          <ol className="mt-3 space-y-3">
            {questions.map((qq, i) => {
              const chosen = answers[i];
              const right = chosen === qq.correctIndex;
              return (
                <li key={i}>
                  <Card className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-bold text-emce-text">Q{i + 1}. {qq.q}</p>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${right ? "bg-emce-light-soft text-emce-success-deep" : "bg-emce-red-light text-emce-red-deep"}`}>
                        {right ? "✓" : chosen === undefined ? "—" : "✗"}
                      </span>
                    </div>
                    <ul className="mt-2 space-y-1 text-sm">
                      {qq.options.map((opt, oi) => (
                        <li
                          key={oi}
                          className={
                            oi === qq.correctIndex ? "font-bold text-emce-success-deep"
                            : oi === chosen ? "text-emce-red-deep line-through"
                            : "text-emce-text-sec"
                          }
                        >
                          {String.fromCharCode(65 + oi)}. {opt}
                          {oi === qq.correctIndex && " ✓"}
                        </li>
                      ))}
                    </ul>
                    {qq.explanation && <p className="mt-2 text-hint text-emce-text-sec"><strong>Why:</strong> {qq.explanation}</p>}
                  </Card>
                </li>
              );
            })}
          </ol>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg"><Link href="/recruitathon/tests">← Back to your tests</Link></Button>
            <Button asChild size="lg" variant="outline"><a href="/api/recruitathon/report">📄 Download my report (PDF)</a></Button>
          </div>
          <p className="mt-2 text-hint text-emce-text-sec">Selected more than one role? Head back to take your remaining tests.</p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
