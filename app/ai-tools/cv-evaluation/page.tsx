import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { uploadResumeForEvaluation } from "@/server/ai-tools/cv-evaluation-actions";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Expert CV Evaluation — deep section-by-section AI review",
  description:
    "Upload your CV. We read every section — summary, experience, skills, projects — and return per-section scores + specific rewrite suggestions for the weak bullets.",
  alternates: { canonical: `${env.NEXT_PUBLIC_APP_URL}/ai-tools/cv-evaluation` },
};

export default async function CvEvaluationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
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
              🔬 Expert CV Evaluation
            </h1>
            <p className="mt-3 max-w-2xl text-white/85">
              The deeper sibling of Roast My Resume. We read every section —
              Summary, Experience, Education, Skills, Projects, Formatting —
              and return per-section scores + specific &ldquo;weak phrasing →
              stronger phrasing&rdquo; rewrites you can apply directly.
            </p>
          </div>
        </section>

        <div className="container max-w-3xl py-8 md:py-10">
          {sp.error && (
            <div
              role="alert"
              className="mb-4 rounded-md border border-emce-red/40 bg-emce-red-light p-3 text-sm text-emce-red-deep"
            >
              {sp.error}
            </div>
          )}

          <Card className="p-6">
            <h2 className="text-section text-emce-text">Upload your CV</h2>
            <p className="mt-1 text-hint text-emce-text-sec">
              PDF or DOCX, under 10MB. We never store the raw bytes — only
              the parsed text length, score, and feedback.
            </p>
            <form action={uploadResumeForEvaluation} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Honeypot — silently rejects bots */}
              <div className="hidden" aria-hidden="true">
                <label>
                  Website (leave empty):
                  <input type="text" name="website" tabIndex={-1} autoComplete="off" />
                </label>
              </div>

              <div className="sm:col-span-2">
                <Label htmlFor="resume" required>
                  Resume file
                </Label>
                <Input
                  id="resume"
                  name="resume"
                  type="file"
                  accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.pdf,.doc,.docx"
                  required
                />
              </div>

              <div>
                <Label htmlFor="targetRole" optional>
                  Target role
                </Label>
                <Input
                  id="targetRole"
                  name="targetRole"
                  maxLength={120}
                  placeholder="e.g. Senior Battery Engineer"
                />
                <p className="mt-1 text-hint text-emce-text-muted">
                  Helps us pitch the evaluation to the right bar.
                </p>
              </div>

              <div>
                <Label htmlFor="evDomainSlug" optional>
                  EV domain
                </Label>
                <NativeSelect id="evDomainSlug" name="evDomainSlug" defaultValue="">
                  <option value="">— general EV evaluation —</option>
                  {evDomains.map((d) => (
                    <option key={d.slug} value={d.slug}>{d.name}</option>
                  ))}
                </NativeSelect>
              </div>

              <div className="sm:col-span-2 flex justify-end border-t border-emce-border pt-4">
                <SubmitButton size="lg" pendingLabel="Reading every section…">
                  Evaluate my CV →
                </SubmitButton>
              </div>
            </form>
          </Card>

          <Card className="mt-6 bg-emce-light-soft">
            <h3 className="text-section text-emce-text">When to use this vs Roast My Resume</h3>
            <ul className="mt-2 space-y-1 text-sm text-emce-text">
              <li>
                <strong>Roast My Resume:</strong> 30-second sanity check. Single
                0-100 score + 3-5 fixes. Use for a quick read or to share.
              </li>
              <li>
                <strong>This (Expert Evaluation):</strong> 2-minute deep review.
                Per-section scores + rewrite suggestions for every weak bullet.
                Use when you have 30 minutes to rework the document.
              </li>
            </ul>
            <p className="mt-3 text-hint text-emce-text-sec">
              Just need a polished resume from scratch?{" "}
              <Link href="/ai-tools/resume-creator" className="font-bold text-emce-dark underline">
                Try the Resume Creator →
              </Link>
            </p>
          </Card>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
