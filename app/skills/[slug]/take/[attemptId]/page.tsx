import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SkillAssessmentRunner } from "@/components/skills/SkillAssessmentRunner";
import { parseSkillAssessmentQuestions } from "@/server/skills/parse";

export const metadata = {
  title: "Skill assessment in progress",
  robots: { index: false, follow: false },
};

/**
 * #28 Runner page. Loads the in-flight AssessmentAttempt + its
 * underlying assessment JSON, hands off to the client runner. The
 * runner is a client component because the candidate needs an
 * interactive question stepper + a countdown timer + soft auto-save
 * of selected options to localStorage between page-blur events.
 */
export default async function SkillAssessmentRunPage({
  params,
}: {
  params: Promise<{ slug: string; attemptId: string }>;
}) {
  const { slug, attemptId } = await params;
  const session = await auth();
  if (!session?.user) {
    redirect(`/signin?next=${encodeURIComponent(`/skills/${slug}`)}`);
  }

  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!profile) redirect("/onboarding");

  const attempt = await db.assessmentAttempt.findUnique({
    where: { id: attemptId },
    include: {
      assessment: {
        include: { skillMeta: true },
      },
    },
  });
  if (!attempt) notFound();
  if (attempt.candidateId !== profile.id) redirect("/403");
  if (!attempt.assessment.skillMeta) notFound();
  if (attempt.assessment.skillMeta.slug !== slug) notFound();

  if (attempt.submittedAt) {
    redirect(`/skills/${slug}/result/${attempt.id}`);
  }

  const questions = parseSkillAssessmentQuestions(attempt.assessment.questions);
  if (questions.length === 0) notFound();

  return (
    <>
      <SiteHeader />
      <main className="container max-w-3xl py-8">
        <div className="mb-4 animate-fade-up">
          <Badge variant="default">In progress</Badge>
          <h1 className="mt-1 text-2xl font-extrabold leading-tight tracking-tight text-emce-text md:text-[28px]">
            {attempt.assessment.title}
          </h1>
          <p className="mt-1 text-hint text-emce-text-sec">
            {questions.length} questions · pass at{" "}
            {attempt.assessment.skillMeta.badgeThreshold}% · don&apos;t close the tab,
            we save your answers as you go.
          </p>
        </div>

        <Card animate>
          <SkillAssessmentRunner
            attemptId={attempt.id}
            slug={slug}
            questions={questions}
          />
        </Card>

        <p className="mt-4 text-center text-hint text-emce-text-muted">
          Need to step away? Your selections persist in this browser. Returning
          to the same link within an hour resumes where you left off.{" "}
          <Link href={`/skills/${slug}`} className="font-bold text-emce-dark hover:underline">
            Back to overview
          </Link>
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
