import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Card } from "@/components/ui/card";
import { ResumeBuilderForm } from "@/components/ai-tools/ResumeBuilderForm";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "ATS Resume Creator — AI-built EV-industry resume",
  description:
    "Paste your brain dump, get a clean ATS-friendly EV-industry resume back. Tuned to battery / charging / motors / software hiring — not generic SaaS templates.",
  alternates: { canonical: `${env.NEXT_PUBLIC_APP_URL}/ai-tools/resume-creator` },
};

export default async function ResumeCreatorPage() {
  const evDomains = await db.eVDomain.findMany({
    orderBy: { order: "asc" },
    select: { slug: true, name: true },
  });

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-emce-light-bg">
        <section className="emce-hero-gradient text-white print:hidden">
          <div className="container max-w-3xl py-12 md:py-16">
            <p className="text-hint font-bold uppercase tracking-wide text-emce-mid">
              AI Tool · Free · No signup needed
            </p>
            <h1 className="mt-2 text-3xl font-extrabold leading-tight md:text-4xl">
              📄 ATS Resume Creator
            </h1>
            <p className="mt-3 max-w-2xl text-white/85">
              Paste a brain-dump of your past roles, projects, and skills.
              The AI restructures it into a clean ATS-friendly EV-industry
              resume — strong verbs, quantified bullets, ATS-indexable
              skills line. Print to PDF when you&apos;re happy.
            </p>
          </div>
        </section>

        <div className="container max-w-3xl py-8 md:py-10">
          <ResumeBuilderForm evDomains={evDomains} />

          <Card className="mt-6 bg-emce-light-soft print:hidden">
            <h3 className="text-section text-emce-text">Why ATS-friendly matters</h3>
            <p className="mt-2 text-sm text-emce-text">
              Most EV recruiters at Tata, Ola, Bosch, and partners run resumes
              through an Applicant Tracking System before a human reads them.
              Fancy two-column layouts with icons + sidebars often get
              chopped to mush. A clean single-column resume with a comma-
              separated Skills line gets indexed correctly — and that&apos;s
              what shows up in keyword searches.
            </p>
            <p className="mt-3 text-hint text-emce-text-sec">
              Already have a resume?{" "}
              <Link href="/ai-tools/cv-evaluation" className="font-bold text-emce-dark underline">
                Run it through Expert CV Evaluation →
              </Link>{" "}
              first to find what to fix.
            </p>
          </Card>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
