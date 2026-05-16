import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Verified EV Skill Badges — battery, BMS, motor, charging",
  description:
    "Take an EV skill assessment, earn a verified badge that recruiters can filter for. Free, ~30 minutes each. Battery, BMS, EV powertrain, charging, safety.",
  alternates: { canonical: `${env.NEXT_PUBLIC_APP_URL}/skills` },
  openGraph: {
    type: "website",
    url: `${env.NEXT_PUBLIC_APP_URL}/skills`,
    title: "Verified EV Skills · emobility.careers",
    description: "Standalone EV skill assessments. Pass → earn a recruiter-visible badge.",
  },
};

/**
 * #28 Verified Skill Assessment browse page. Lists every public
 * SkillAssessmentMeta grouped by EV domain. Logged-in candidates see
 * a "✓ Earned" pill next to assessments they've already passed.
 */
export const dynamic = "force-dynamic";

export default async function SkillsPage() {
  const session = await auth();
  const profileId = session?.user
    ? (await db.candidateProfile.findUnique({
        where: { userId: session.user.id },
        select: { id: true },
      }))?.id
    : null;

  const [metas, evDomains, badges] = await Promise.all([
    db.skillAssessmentMeta.findMany({
      where: { isPublic: true },
      orderBy: [{ evDomainSlug: "asc" }, { sortOrder: "asc" }],
      include: { assessment: { select: { title: true, passingScore: true } } },
    }),
    db.eVDomain.findMany({ orderBy: { order: "asc" } }),
    profileId
      ? db.verifiedSkillBadge.findMany({
          where: { candidateId: profileId },
          select: { metaId: true, score: true },
        })
      : Promise.resolve([]),
  ]);

  const badgeMap = new Map(badges.map((b) => [b.metaId, b.score]));
  const grouped = new Map<string, typeof metas>();
  for (const m of metas) {
    const arr = grouped.get(m.evDomainSlug) ?? [];
    arr.push(m);
    grouped.set(m.evDomainSlug, arr);
  }
  const domainName = new Map(evDomains.map((d) => [d.slug, d.name]));

  const totalEarned = badges.length;

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-emce-light-bg">
        <section className="emce-mesh-hero relative text-white">
          <span
            aria-hidden
            className="pointer-events-none absolute -left-10 top-10 hidden h-56 w-56 rounded-full bg-emce-mid/30 blur-3xl animate-float md:block"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute -right-10 bottom-4 hidden h-64 w-64 rounded-full bg-emce-light/20 blur-3xl animate-float md:block"
            style={{ animationDelay: "1.6s" }}
          />
          <div
            aria-hidden
            className="emce-dot-grid pointer-events-none absolute inset-0 opacity-25"
          />
          <div className="container relative max-w-4xl py-12 md:py-16">
            <div className="emce-pill mb-3 animate-fade-up">
              <span aria-hidden>🏅</span>
              <span>Verified skill badges · Free · ~30 min each</span>
            </div>
            <h1
              className="animate-fade-up text-3xl font-extrabold leading-tight tracking-tight md:text-4xl"
              style={{ animationDelay: "80ms" }}
            >
              Prove what you know.{" "}
              <span className="emce-text-gradient">Get on recruiter shortlists.</span>
            </h1>
            <p
              className="animate-fade-up mt-3 max-w-2xl text-white/85 md:text-lg"
              style={{ animationDelay: "160ms" }}
            >
              Free MCQ assessments tuned to the Indian EV hiring bar. Pass at 70%+
              and your profile shows a verified badge that recruiters can filter
              for. Battery, BMS, powertrain, charging, safety, and more.
            </p>
            {profileId && totalEarned > 0 && (
              <p
                className="animate-fade-up mt-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-sm font-bold backdrop-blur"
                style={{ animationDelay: "240ms" }}
              >
                ✓ You&apos;ve earned {totalEarned} badge{totalEarned === 1 ? "" : "s"}
              </p>
            )}
          </div>
        </section>

        <div className="container max-w-4xl space-y-8 py-10">
          {Array.from(grouped.entries()).map(([domainSlug, items]) => (
            <section key={domainSlug}>
              <div className="mb-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emce-mid-muted">
                  EV domain
                </p>
                <h2 className="text-section text-emce-text">
                  {domainName.get(domainSlug) ?? domainSlug}
                </h2>
              </div>
              <ul className="emce-stagger grid gap-3 sm:grid-cols-2">
                {items.map((m) => {
                  const earnedScore = badgeMap.get(m.id);
                  return (
                    <li key={m.id}>
                      <Card variant="interactive" className="h-full">
                        <Link href={`/skills/${m.slug}`} className="block">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="text-section text-emce-text">
                              {m.assessment.title}
                            </h3>
                            {earnedScore !== undefined ? (
                              <Badge variant="verified">✓ {earnedScore}%</Badge>
                            ) : (
                              <Badge variant={m.difficulty === "ADVANCED" ? "warning" : "default"}>
                                {m.difficulty}
                              </Badge>
                            )}
                          </div>
                          <p className="mt-2 text-hint text-emce-text-sec">{m.blurb}</p>
                          <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-emce-text-muted">
                            <span>⏱ {m.estimatedMinutes} min</span>
                            <span>· Pass at {m.badgeThreshold}%</span>
                            <span>· Recruiter weight {m.recruiterWeight}/5</span>
                          </div>
                        </Link>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          {!profileId && (
            <Card className="text-center">
              <p className="text-section text-emce-text">Sign in to track your badges</p>
              <p className="mt-1 text-hint text-emce-text-sec">
                You can browse all assessments anonymously, but to take one and
                earn a badge, sign up first.
              </p>
              <Button asChild className="mt-3">
                <Link href="/signup?role=CANDIDATE">Create candidate profile →</Link>
              </Button>
            </Card>
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
