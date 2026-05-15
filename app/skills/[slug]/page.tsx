import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { startSkillAssessment } from "@/server/skills/actions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const meta = await db.skillAssessmentMeta.findUnique({
    where: { slug },
    include: { assessment: { select: { title: true } } },
  });
  if (!meta) return { title: "Skill assessment not found" };
  return {
    title: `${meta.assessment.title} — verified EV skill badge`,
    description: meta.blurb,
  };
}

interface PrepLink {
  title: string;
  url: string;
}

export default async function SkillAssessmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ already?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const session = await auth();

  const meta = await db.skillAssessmentMeta.findUnique({
    where: { slug },
    include: {
      assessment: {
        select: { title: true, questions: true, passingScore: true, durationMins: true },
      },
    },
  });
  if (!meta || !meta.isPublic) notFound();

  // Have we already earned this badge?
  let earnedScore: number | null = null;
  if (session?.user) {
    const profile = await db.candidateProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });
    if (profile) {
      const badge = await db.verifiedSkillBadge.findUnique({
        where: { candidateId_metaId: { candidateId: profile.id, metaId: meta.id } },
      });
      earnedScore = badge?.score ?? null;
    }
  }

  const prepLinks =
    Array.isArray(meta.prepLinks) ? (meta.prepLinks as unknown as PrepLink[]) : [];

  // Count questions for the "N questions" line — we read the JSON
  // shape lazily (don't validate per-question here; the runner does
  // the strict parse).
  let questionCount = 0;
  const qJson = meta.assessment.questions as unknown;
  if (qJson && typeof qJson === "object" && "questions" in qJson && Array.isArray((qJson as { questions: unknown[] }).questions)) {
    questionCount = (qJson as { questions: unknown[] }).questions.length;
  }

  return (
    <>
      <SiteHeader />
      <main className="container max-w-3xl py-10">
        <Link href="/skills" className="text-hint font-bold text-emce-dark hover:underline">
          ← All skill assessments
        </Link>

        <header className="mt-4 animate-fade-up">
          <div className="flex items-baseline gap-2">
            <Badge variant={meta.difficulty === "ADVANCED" ? "warning" : "default"}>
              {meta.difficulty}
            </Badge>
            {earnedScore !== null && (
              <Badge variant="verified">✓ Earned · {earnedScore}%</Badge>
            )}
          </div>
          <h1 className="mt-2 text-2xl font-extrabold leading-tight tracking-tight text-emce-text md:text-[32px]">
            {meta.assessment.title}
          </h1>
          <p className="mt-2 text-body text-emce-text-sec">{meta.blurb}</p>
        </header>

        {sp.already === "1" && (
          <div className="mt-4 rounded-md border border-emce-mid bg-emce-light-soft p-3 text-sm text-emce-success-deep">
            ✓ You&apos;ve already earned this badge. Browse{" "}
            <Link href="/skills" className="font-bold text-emce-dark hover:underline">
              more assessments
            </Link>{" "}
            to add to your collection.
          </div>
        )}

        <Card variant="glow" animate className="mt-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Questions" value={`${questionCount}`} />
            <Stat label="Time" value={`~${meta.estimatedMinutes} min`} />
            <Stat label="Pass at" value={`${meta.badgeThreshold}%`} />
          </div>

          <form action={startSkillAssessment} className="mt-6">
            <input type="hidden" name="slug" value={meta.slug} />
            {earnedScore !== null ? (
              <p className="text-hint text-emce-text-sec">
                Re-taking is disabled — your badge is locked in.{" "}
                <Link href="/skills" className="font-bold text-emce-dark hover:underline">
                  Try another assessment
                </Link>
                .
              </p>
            ) : !session?.user ? (
              <Button asChild variant="glow" size="lg" className="w-full">
                <Link
                  href={`/signin?next=${encodeURIComponent(`/skills/${meta.slug}`)}`}
                >
                  Sign in to take the assessment →
                </Link>
              </Button>
            ) : (
              <SubmitButton variant="glow" size="lg" className="w-full" pendingLabel="Starting…">
                ⚡ Start the assessment
              </SubmitButton>
            )}
          </form>
        </Card>

        {prepLinks.length > 0 && (
          <Card className="mt-4">
            <h2 className="text-section text-emce-text">Brush up first?</h2>
            <p className="mt-1 text-hint text-emce-text-sec">
              These reads cover the territory the assessment tests. Free + curated.
            </p>
            <ul className="mt-3 space-y-2">
              {prepLinks.map((l) => (
                <li key={l.url}>
                  <Link
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-hint font-bold text-emce-dark hover:underline"
                  >
                    → {l.title}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card className="mt-4">
          <h2 className="text-section text-emce-text">What recruiters see</h2>
          <p className="mt-1 text-hint text-emce-text-sec">
            Your profile shows a <Badge variant="verified">✓ {meta.assessment.title}</Badge>{" "}
            badge. Recruiters can filter candidate search by "verified in this skill" —
            higher recruiter-weight assessments rank higher in that filter.
          </p>
        </Card>
      </main>
      <SiteFooter />
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-emce-text-muted">
        {label}
      </p>
      <p className="mt-0.5 text-xl font-extrabold text-emce-text">{value}</p>
    </div>
  );
}
