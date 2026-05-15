import Link from "next/link";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Card } from "@/components/ui/card";
import { CoverLetterForm } from "@/components/ai-tools/CoverLetterForm";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "EV Cover Letter Generator — tailored letters in 30 seconds",
  description:
    "Generate a tailored EV-industry cover letter for any role. AI tuned to battery / charging / motors / software hiring — not generic SaaS templates.",
  alternates: { canonical: `${env.NEXT_PUBLIC_APP_URL}/ai-tools/cover-letter` },
};

export default function CoverLetterPage() {
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
              ✍️ EV Cover Letter Generator
            </h1>
            <p className="mt-3 max-w-2xl text-white/85">
              Paste a target role + your background. Pick a tone. The AI
              writes a 300-400 word EV-industry cover letter in the right
              register — no generic &ldquo;transferable skills&rdquo; filler.
            </p>
          </div>
        </section>

        <div className="container max-w-3xl py-8 md:py-10">
          <CoverLetterForm />

          <Card className="mt-6 bg-emce-light-soft">
            <h3 className="text-section text-emce-text">Why bother with a cover letter for EV?</h3>
            <p className="mt-2 text-sm text-emce-text">
              EV hiring loops still read cover letters when the role is
              specialist — battery, motor controls, charging, software-on-
              vehicle. A well-anchored letter that names a relevant project
              + the specific tech the company uses moves applications from
              &ldquo;auto-reject&rdquo; to &ldquo;screen first&rdquo; in
              recruiter inboxes.
            </p>
            <p className="mt-3 text-hint text-emce-text-sec">
              Already wrote one and want a sanity check?{" "}
              <Link href="/roast" className="font-bold text-emce-dark underline">
                Run your resume through Roast My Resume →
              </Link>
            </p>
          </Card>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
