import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Card } from "@/components/ui/card";
import { CareerPathForm } from "@/components/ai-tools/CareerPathForm";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "EV Career Path Advisor — chart your 1, 3, 5-year roadmap",
  description:
    "AI-curated career roadmap for the EV industry. 3-5 milestones, India INR salary signals, and the skills to acquire at each stage.",
  alternates: { canonical: `${env.NEXT_PUBLIC_APP_URL}/ai-tools/career-path` },
};

export default async function CareerPathPage() {
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
              🧬 EV Career Path Advisor
            </h1>
            <p className="mt-3 max-w-2xl text-white/85">
              Tell us where you are and where you want to go. We&apos;ll
              chart a 3-5 milestone roadmap with India INR salary signals,
              the skills to acquire at each stage, and the
              ready-for-next-stage signal that proves you can move.
            </p>
          </div>
        </section>

        <div className="container max-w-3xl py-8 md:py-10">
          <CareerPathForm evDomains={evDomains} />

          <Card className="mt-6 bg-emce-light-soft">
            <h3 className="text-section text-emce-text">A note on the salary numbers</h3>
            <p className="mt-2 text-sm text-emce-text">
              Salary bands are mid-2026 India market signals — conservative
              by design. They&apos;re for sanity-checking, not negotiation.
              For the live picture across actual offers, use{" "}
              <Link href="/salaries" className="font-bold text-emce-dark underline">
                Salary Compass
              </Link>
              .
            </p>
          </Card>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
