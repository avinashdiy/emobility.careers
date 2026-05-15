import Link from "next/link";
import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { uploadResumeForRoast } from "@/server/roast/actions";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "EV Resume Roast — score your CV against India's EV industry",
  description:
    "Free, no signup. Upload a PDF or DOCX and we'll score it on EV-specific dimensions: battery exposure, charging knowledge, motors, software, project impact, format. Share your score on LinkedIn / WhatsApp.",
  alternates: { canonical: `${env.NEXT_PUBLIC_APP_URL}/roast` },
  openGraph: {
    title: "EV Resume Roast · emobility.careers",
    description: "Score your resume against India's EV industry. Free, no signup.",
    url: `${env.NEXT_PUBLIC_APP_URL}/roast`,
    type: "website",
  },
};

/**
 * Free, no-signup-required upload form. The bet: a curious visitor
 * uploads their resume in 30 seconds, gets a punchy score + 3-5 fixes,
 * shares it on LinkedIn ("My EV Resume Roast: 78/100, here's how to
 * fix it") — and every share carries the platform's URL.
 *
 * No login wall, deliberately. The signup CTA only appears AFTER the
 * roast lands (on /roast/[id]) where the user has already seen the
 * value.
 */
export default async function RoastUploadPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-emce-light-bg">
        <section className="emce-mesh-hero relative text-white">
          <span
            aria-hidden
            className="pointer-events-none absolute -left-8 top-8 hidden h-48 w-48 rounded-full bg-emce-orange/30 blur-3xl animate-float md:block"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute -right-10 bottom-4 hidden h-56 w-56 rounded-full bg-emce-mid/25 blur-3xl animate-float md:block"
            style={{ animationDelay: "1.6s" }}
          />
          <div
            aria-hidden
            className="emce-dot-grid pointer-events-none absolute inset-0 opacity-25"
          />
          <div className="container relative max-w-3xl py-14 md:py-20">
            <div className="emce-pill mb-4 animate-fade-up">
              <span aria-hidden>🔥</span>
              <span>Free · No signup required</span>
            </div>
            <h1
              className="animate-fade-up text-3xl font-extrabold leading-tight tracking-tight md:text-5xl"
              style={{ animationDelay: "80ms" }}
            >
              How EV-ready is your{" "}
              <span className="emce-text-gradient">resume?</span>
            </h1>
            <p
              className="animate-fade-up mt-4 max-w-xl text-white/85 md:text-lg"
              style={{ animationDelay: "160ms" }}
            >
              Upload a PDF or DOCX. We&apos;ll score your CV on six EV-industry dimensions, point out the three biggest fixes, and give you a card you can post on LinkedIn.
            </p>
          </div>
        </section>

        <div className="container max-w-3xl space-y-6 py-10">
          {sp.error && (
            <div className="rounded-md border border-emce-red bg-emce-red-light p-3 text-sm text-emce-red-deep">
              ⚠️ {sp.error}
            </div>
          )}

          <Card>
            <form
              action={uploadResumeForRoast}
              encType="multipart/form-data"
              className="space-y-4"
            >
              {/* Honeypot — hidden from real users; bots fill it. */}
              <div aria-hidden className="sr-only" style={{ position: "absolute", left: "-10000px" }}>
                <label>
                  Website (leave blank)
                  <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
                </label>
              </div>

              <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-emce-border bg-emce-light-soft/40 p-10 text-center transition hover:border-emce-mid hover:bg-emce-light-soft">
                <span aria-hidden className="text-4xl">📄</span>
                <span className="font-bold text-emce-text">Click to upload your resume</span>
                <span className="text-hint text-emce-text-sec">
                  PDF or DOCX · max 10MB · we never store the file
                </span>
                <input
                  type="file"
                  name="resume"
                  accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  required
                  className="sr-only"
                />
              </label>

              <Button type="submit" size="lg" className="w-full">
                ⚡ Roast my resume →
              </Button>
              <p className="text-center text-hint text-emce-text-muted">
                We extract text only. The PDF / DOCX itself is never saved. Roast results are private to your browser unless you share the link.
              </p>
            </form>
          </Card>

          <div className="grid gap-4 sm:grid-cols-3">
            <ScoreDimensionCard
              emoji="🔋"
              title="EV depth"
              body="Battery, charging, motors, software, policy — does your CV name the EV stack you've actually touched?"
            />
            <ScoreDimensionCard
              emoji="🎯"
              title="Project impact"
              body="Quantified outcomes. Range %, kWh saved, hours of test bench. Numbers travel through ten hops."
            />
            <ScoreDimensionCard
              emoji="📐"
              title="Format & clarity"
              body="Section headers, dates, length. Recruiters bounce in 6 seconds when the timeline isn't legible."
            />
          </div>

          <Card className="border-dashed bg-emce-light-bg">
            <p className="text-section text-emce-text">
              👀 Want to skip the roast and just sign up?
            </p>
            <p className="mt-1 text-hint text-emce-text-sec">
              Build a verified profile in 3 minutes — we auto-fill from your resume too.
            </p>
            <Button asChild variant="outline" className="mt-3">
              <Link href="/signup?role=CANDIDATE">Sign up free →</Link>
            </Button>
          </Card>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

function ScoreDimensionCard({ emoji, title, body }: { emoji: string; title: string; body: string }) {
  return (
    <Card className="text-center">
      <div className="text-3xl" aria-hidden>{emoji}</div>
      <p className="mt-2 font-bold text-emce-text">{title}</p>
      <p className="mt-1 text-hint text-emce-text-sec">{body}</p>
    </Card>
  );
}
