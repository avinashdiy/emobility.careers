import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Card } from "@/components/ui/card";
import { SkillsAnalyzerForm } from "@/components/ai-tools/SkillsAnalyzerForm";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Analyze Your EV Skills — AI gap analysis for EV careers",
  description:
    "Get an honest, EV-industry-specific read on your skill set. Scored coverage across battery / charging / motors / software / industry context, with 3-5 prioritised next steps.",
  alternates: { canonical: `${env.NEXT_PUBLIC_APP_URL}/ai-tools/skills-analyzer` },
};

export default async function SkillsAnalyzerPage() {
  const evDomains = await db.eVDomain.findMany({
    orderBy: { order: "asc" },
    select: { slug: true, name: true },
  });

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-emce-light-bg">
        <section className="emce-hero-gradient text-white">
          <div className="container max-w-3xl py-12 md:py-16">
            <p className="text-hint font-bold uppercase tracking-wide text-emce-mid">
              AI Tool · Free · No signup needed
            </p>
            <h1 className="mt-2 text-3xl font-extrabold leading-tight md:text-4xl">
              🧭 Analyze Your EV Skills
            </h1>
            <p className="mt-3 max-w-2xl text-white/85">
              Tell us what you know. We&apos;ll score you against India&apos;s
              EV hiring bar — battery, charging, motors, software, industry
              context — and tell you the 3-5 things to learn next.
            </p>
          </div>
        </section>

        <div className="container max-w-3xl py-8 md:py-10">
          <SkillsAnalyzerForm evDomains={evDomains} />

          <Card className="mt-6 bg-emce-light-soft">
            <h3 className="text-section text-emce-text">How it&apos;s scored</h3>
            <ul className="mt-2 space-y-1 text-sm text-emce-text">
              <li>
                <strong>Coverage</strong> — 5-pillar bars that show where the
                EV industry needs depth.
              </li>
              <li>
                <strong>Gaps</strong> — what to learn next, prioritised by
                impact on your shortlist-ability.
              </li>
              <li>
                <strong>Strengths</strong> — what you already have that&apos;s
                actually rare. Bring these forward on your resume.
              </li>
            </ul>
            <p className="mt-3 text-hint text-emce-text-sec">
              Want to see how your resume reads end-to-end?{" "}
              <Link href="/roast" className="font-bold text-emce-dark underline">
                Try Roast My Resume →
              </Link>
            </p>
          </Card>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
