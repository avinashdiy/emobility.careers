import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Card } from "@/components/ui/card";
import { LinkedInOptimizerForm } from "@/components/ai-tools/LinkedInOptimizerForm";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "LinkedIn Profile Optimizer — for EV-industry candidates",
  description:
    "AI rewrite of your LinkedIn headline + About section, tuned to how recruiters search for EV-industry talent. 3 headline alternatives, missing keywords, section gaps.",
  alternates: { canonical: `${env.NEXT_PUBLIC_APP_URL}/ai-tools/linkedin-optimizer` },
};

export default async function LinkedInOptimizerPage() {
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
              💼 LinkedIn Profile Optimizer
            </h1>
            <p className="mt-3 max-w-2xl text-white/85">
              Paste your headline + About. We&apos;ll score the current profile,
              give you 3 sharper headline alternatives, rewrite the About
              section without the clichés, and flag the EV-domain keywords
              recruiters search for that you&apos;re missing.
            </p>
          </div>
        </section>

        <div className="container max-w-3xl py-8 md:py-10">
          <LinkedInOptimizerForm evDomains={evDomains} />

          <Card className="mt-6 bg-emce-light-soft">
            <h3 className="text-section text-emce-text">Why recruiters can&apos;t find you</h3>
            <p className="mt-2 text-sm text-emce-text">
              EV recruiters search by very specific keywords —{" "}
              <em>OCPP, AIS-156, ISO-26262, FOC, AUTOSAR, CCS, GB/T</em>. If
              your profile reads as &ldquo;automotive engineer&rdquo; instead
              of using those terms, you won&apos;t show up in their search
              results even if you&apos;re a perfect fit.
            </p>
            <p className="mt-3 text-hint text-emce-text-sec">
              Want a second opinion?{" "}
              <Link href="/ai-tools/skills-analyzer" className="font-bold text-emce-dark underline">
                Run your skills through the analyzer →
              </Link>
            </p>
          </Card>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
