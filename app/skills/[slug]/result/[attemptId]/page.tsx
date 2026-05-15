import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Confetti } from "@/components/ui/confetti";

export const metadata = {
  title: "Skill assessment result",
  robots: { index: false, follow: false },
};

/**
 * #28 — Per-attempt result page. Shows the score + pass/fail outcome
 * + (on pass) fires the confetti delighter and surfaces a share-on-
 * LinkedIn link. On fail, encourages a retry-after-prep flow.
 */
export default async function SkillAssessmentResultPage({
  params,
}: {
  params: Promise<{ slug: string; attemptId: string }>;
}) {
  const { slug, attemptId } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/signin?next=/skills/${slug}`);

  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true, slug: true },
  });
  if (!profile) redirect("/onboarding");

  const attempt = await db.assessmentAttempt.findUnique({
    where: { id: attemptId },
    include: {
      assessment: { include: { skillMeta: true } },
    },
  });
  if (!attempt) notFound();
  if (attempt.candidateId !== profile.id) redirect("/403");
  if (!attempt.assessment.skillMeta) notFound();
  if (attempt.assessment.skillMeta.slug !== slug) notFound();
  if (!attempt.submittedAt) {
    redirect(`/skills/${slug}/take/${attempt.id}`);
  }

  const meta = attempt.assessment.skillMeta;
  const score = attempt.score ?? 0;
  const passed = !!attempt.passed;
  const ranking =
    score >= 90 ? "Top of the field"
    : score >= 80 ? "Strong pass"
    : score >= meta.badgeThreshold ? "Solid pass"
    : "Almost there";

  return (
    <>
      <SiteHeader />
      <main className="container max-w-3xl py-10">
        {passed && <Confetti />}
        <Link href="/skills" className="text-hint font-bold text-emce-dark hover:underline">
          ← All skill assessments
        </Link>

        <Card variant={passed ? "glow" : "default"} animate className="mt-4">
          <div className="text-center">
            <Badge variant={passed ? "verified" : "warning"}>
              {passed ? "✓ Badge earned" : "Not quite"}
            </Badge>
            <h1 className="mt-3 text-3xl font-extrabold leading-none text-emce-text md:text-5xl">
              <span className={passed ? "emce-text-gradient" : "text-emce-text"}>
                {score}%
              </span>
            </h1>
            <p className="mt-1 text-section text-emce-text">{ranking}</p>
            <p className="mt-1 text-hint text-emce-text-sec">
              {attempt.assessment.title} — pass at {meta.badgeThreshold}%
            </p>
          </div>

          {passed ? (
            <div className="mt-6 text-center">
              <p className="text-body text-emce-text">
                Your public profile now shows the{" "}
                <Badge variant="verified" className="text-[10px]">
                  ✓ {attempt.assessment.title}
                </Badge>{" "}
                badge. Recruiters who filter "verified in this skill" will see
                you first.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button asChild variant="glow">
                  <Link href={`/${profile.slug}`}>See your profile →</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link
                    href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
                      `https://emobility.careers/skills/${slug}`,
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Share on LinkedIn
                  </Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-6 text-center">
              <p className="text-body text-emce-text">
                You&apos;re {meta.badgeThreshold - score} percentage points from
                the badge. Brush up on the prep links and try again — re-takes
                are free.
              </p>
              <Button asChild className="mt-4" variant="outline">
                <Link href={`/skills/${slug}`}>Back to overview</Link>
              </Button>
            </div>
          )}
        </Card>

        <Card className="mt-4">
          <h2 className="text-section text-emce-text">What&apos;s next</h2>
          <p className="mt-1 text-hint text-emce-text-sec">
            Stack more badges in adjacent areas — recruiters filter on
            multiple at once.
          </p>
          <Button asChild className="mt-3" variant="outline">
            <Link href="/skills">Browse more assessments →</Link>
          </Button>
        </Card>
      </main>
      <SiteFooter />
    </>
  );
}
