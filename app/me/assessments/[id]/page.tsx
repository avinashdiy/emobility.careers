import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { MCQRunner } from "@/components/assessments/MCQRunner";
import type { MCQQuestion } from "@/server/assessments/actions";

export default async function AttemptRunner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!profile) redirect("/onboarding");

  const attempt = await db.assessmentAttempt.findUnique({
    where: { id },
    include: { assessment: true },
  });
  if (!attempt || attempt.candidateId !== profile.id) notFound();
  if (attempt.submittedAt) redirect(`/me/assessments/${id}/result`);

  if (attempt.assessment.type !== "MCQ") {
    return (
      <div className="container max-w-xl py-20">
        <Card className="p-8 text-center">
          <h1 className="text-section text-emce-text">{attempt.assessment.title}</h1>
          <p className="mt-3 text-hint text-emce-text-sec">
            {attempt.assessment.type} assessments aren&apos;t runnable in v1 — please contact the recruiter.
          </p>
        </Card>
      </div>
    );
  }

  const questions = attempt.assessment.questions as unknown as MCQQuestion[];
  return (
    <MCQRunner
      attemptId={attempt.id}
      title={attempt.assessment.title}
      durationMins={attempt.assessment.durationMins}
      questions={questions}
    />
  );
}
