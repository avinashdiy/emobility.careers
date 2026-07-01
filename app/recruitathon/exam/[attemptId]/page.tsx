import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { RecruitathonExamRunner } from "@/components/recruitathon/RecruitathonExamRunner";
import { PROCTOR_FLAG_LIMIT } from "@/lib/recruitathon/exam-config";
import type { MCQQuestion } from "@/server/assessments/actions";

/**
 * Live proctored-exam surface. Loads the attempt, strips correct
 * answers from the questions (the client must never receive them),
 * computes the server-authoritative deadline, and hands off to the
 * hardened runner. Guards: the attempt must belong to the signed-in
 * candidate and still be open.
 */
export const dynamic = "force-dynamic";

export default async function RecruitathonExamPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const { attemptId } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/signin?next=${encodeURIComponent(`/recruitathon/exam/${attemptId}`)}`);

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
  if (attempt.submittedAt) redirect(`/recruitathon/exam/${attempt.id}/result`);

  const questions = attempt.assessment.questions as unknown as MCQQuestion[];
  // Strip correctIndex/weight — the browser only sees prompt + options.
  const publicQuestions = questions.map((q) => ({ q: q.q, options: q.options }));

  const durationMins = attempt.assessment.durationMins ?? 30;
  const deadlineMs = attempt.startedAt.getTime() + durationMins * 60_000;

  return (
    <RecruitathonExamRunner
      attemptId={attempt.id}
      title={attempt.assessment.title}
      deadlineMs={deadlineMs}
      questions={publicQuestions}
      flagLimit={PROCTOR_FLAG_LIMIT}
      initialAnswers={(attempt.answers ?? {}) as Record<number, number>}
    />
  );
}
