import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import type { RoastBreakdown, FeedbackItem } from "@/lib/ai/roast";
import { env } from "@/lib/env";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const roast = await db.resumeRoast.findUnique({
    where: { id },
    select: { scoreOverall: true },
  });
  if (!roast) return { title: "Resume Roast", robots: { index: false, follow: false } };
  return {
    title: `EV Resume Roast — ${roast.scoreOverall}/100`,
    description: `Free EV-industry resume score: ${roast.scoreOverall}/100. Get your own at emobility.careers/roast.`,
    alternates: { canonical: `${env.NEXT_PUBLIC_APP_URL}/roast/${id}` },
  };
}

const DIM_LABELS: Record<keyof RoastBreakdown, { label: string; emoji: string }> = {
  evDepth: { label: "EV depth", emoji: "🔋" },
  experienceClarity: { label: "Experience clarity", emoji: "📅" },
  projectsImpact: { label: "Project impact", emoji: "🎯" },
  skillsCertifications: { label: "Skills & certs", emoji: "🎓" },
  formatReadability: { label: "Format & readability", emoji: "📐" },
};

const SEVERITY_TONE: Record<FeedbackItem["severity"], string> = {
  high: "border-emce-red bg-emce-red-light text-emce-red-deep",
  medium: "border-emce-orange bg-emce-orange-light text-emce-orange-deep",
  low: "border-emce-border bg-emce-light-soft text-emce-text-sec",
};

const SEVERITY_LABEL: Record<FeedbackItem["severity"], string> = {
  high: "Top priority",
  medium: "Worth fixing",
  low: "Nice to have",
};

/**
 * Roast result page. The viral hook landing surface — every share
 * brings new visitors here. The page is intentionally:
 *
 *   - Loud at the top (big score, animated-feeling tier badge)
 *   - Specific in the middle (per-dimension bars + 3-5 actionable fixes)
 *   - Conversion-focused at the bottom (signup CTA + share buttons)
 *
 * No auth required to view a roast; this is on purpose. We trade some
 * spam risk for the viral lift of "click the link, see the score".
 */
export default async function RoastResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const roast = await db.resumeRoast.findUnique({ where: { id } });
  if (!roast) notFound();

  const breakdown = roast.scoreBreakdown as unknown as RoastBreakdown;
  const feedback = (roast.feedback as unknown as FeedbackItem[]) ?? [];

  const tier =
    roast.scoreOverall >= 85 ? { label: "Recruiter-magnet", tone: "bg-emce-mid text-emce-darkest" }
    : roast.scoreOverall >= 70 ? { label: "Strong", tone: "bg-emce-light text-emce-darkest" }
    : roast.scoreOverall >= 55 ? { label: "Good baseline", tone: "bg-emce-orange-light text-emce-orange-deep" }
    : roast.scoreOverall >= 40 ? { label: "Needs work", tone: "bg-emce-orange text-white" }
    : { label: "Roasted", tone: "bg-emce-red text-white" };

  const shareUrl = `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/roast/${roast.id}`;
  const shareText = `My EV Resume Roast on emobility.careers · ${roast.scoreOverall}/100 (${tier.label}). Get yours free:`;
  const linkedinShare = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
  const xShare = `https://twitter.com/intent/tweet?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`;
  const whatsappShare = `https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`;

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-emce-light-bg">
        <section className="emce-hero-gradient text-white">
          <div className="container max-w-3xl py-12 md:py-16">
            <Link href="/roast" className="text-hint font-bold text-emce-mid hover:underline">
              ← Roast another resume
            </Link>
            <h1 className="mt-2 text-2xl font-extrabold leading-tight md:text-4xl">
              Your EV Resume Roast
            </h1>
            <p className="mt-1 text-sm text-white/75">
              Scored on {Object.keys(DIM_LABELS).length} dimensions across India's EV industry rubric.
            </p>

            {/* Score + tier */}
            <div className="mt-6 flex items-baseline gap-4">
              <div className="flex items-baseline">
                <span className="text-7xl font-extrabold leading-none text-emce-mid md:text-8xl">
                  {roast.scoreOverall}
                </span>
                <span className="ml-1 text-3xl font-bold text-white/55">/100</span>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-extrabold uppercase tracking-widest ${tier.tone}`}>
                {tier.label}
              </span>
            </div>
          </div>
        </section>

        <div className="container max-w-3xl space-y-6 py-8">
          {/* Share strip — sits high so visitors share *before* reading details */}
          <Card>
            <p className="text-section text-emce-text">Share your score</p>
            <p className="mt-1 text-hint text-emce-text-sec">
              The link unfurls as a card with your score. Post it where you spend time — every share brings 5 friends here.
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <a
                href={linkedinShare}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md bg-[#0a66c2] px-3 py-2 text-center text-sm font-bold text-white hover:opacity-90"
              >
                LinkedIn
              </a>
              <a
                href={xShare}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md bg-black px-3 py-2 text-center text-sm font-bold text-white hover:opacity-90"
              >
                X
              </a>
              <a
                href={whatsappShare}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md bg-[#25D366] px-3 py-2 text-center text-sm font-bold text-white hover:opacity-90"
              >
                WhatsApp
              </a>
            </div>
          </Card>

          {/* Per-dimension breakdown */}
          <Card>
            <p className="text-section text-emce-text">Score breakdown</p>
            <ul className="mt-3 space-y-2.5">
              {(Object.keys(DIM_LABELS) as Array<keyof RoastBreakdown>).map((key) => {
                const score = breakdown[key];
                const meta = DIM_LABELS[key];
                return (
                  <li key={key}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-bold text-emce-text">
                        {meta.emoji} {meta.label}
                      </span>
                      <span className="font-extrabold tabular-nums text-emce-text">{score}/100</span>
                    </div>
                    <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-emce-light-soft">
                      <div
                        className={`h-full rounded-full ${
                          score >= 70 ? "bg-emce-mid"
                          : score >= 50 ? "bg-emce-orange"
                          : "bg-emce-red"
                        }`}
                        style={{ width: `${Math.max(2, score)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          {/* Feedback items */}
          {feedback.length > 0 && (
            <Card>
              <p className="text-section text-emce-text">What to fix</p>
              <p className="mt-1 text-hint text-emce-text-sec">
                Specific, actionable. Tackle the {feedback.filter((f) => f.severity === "high").length > 0 ? "high-priority" : "top"} item first.
              </p>
              <ul className="mt-3 space-y-3">
                {feedback.map((f, i) => (
                  <li key={i} className={`rounded-lg border p-3 ${SEVERITY_TONE[f.severity]}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-extrabold">{f.title}</p>
                      <Badge variant="outline" className="text-[10px]">
                        {SEVERITY_LABEL[f.severity]}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-emce-text">{f.body}</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Conversion CTA */}
          <Card className="emce-hero-gradient text-white">
            <p className="text-section text-white">
              💡 Fix all of this in one place
            </p>
            <p className="mt-2 text-white/80">
              Build a verified profile in 3 minutes. We'll auto-import from your resume, surface the gaps, and match you to {`{X}`} live EV roles. Free.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild size="lg" className="bg-emce-mid text-emce-darkest hover:bg-emce-mid-muted">
                <Link href="/signup?role=CANDIDATE&next=/me/profile">Sign up & fix my gaps →</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-white/30 text-white hover:bg-white/10">
                <Link href="/jobs">Browse EV jobs</Link>
              </Button>
            </div>
          </Card>

          <p className="text-center text-hint text-emce-text-muted">
            Roasted on{" "}
            {roast.createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}{" "}
            · scored across {roast.textLength.toLocaleString()} characters of your resume.
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
