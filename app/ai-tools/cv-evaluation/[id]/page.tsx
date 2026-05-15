import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import type { CvSectionAnalysis, CvTopFix } from "@/lib/ai/cv-evaluation";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Expert CV Evaluation — result",
  // Per-evaluation pages are candidate-specific; no value in indexing.
  robots: { index: false, follow: false },
};

export default async function CvEvaluationResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const row = await db.cvEvaluation.findUnique({ where: { id } });
  if (!row) notFound();

  const sections = (row.sectionAnalysis as unknown as CvSectionAnalysis[]) ?? [];
  const topFixes = (row.topFixes as unknown as CvTopFix[]) ?? [];

  const tier =
    row.scoreOverall >= 85 ? { label: "Recruiter-magnet", tone: "bg-emce-mid text-emce-darkest" }
    : row.scoreOverall >= 70 ? { label: "Strong", tone: "bg-emce-light text-emce-darkest" }
    : row.scoreOverall >= 55 ? { label: "Solid baseline", tone: "bg-emce-orange-light text-emce-orange-deep" }
    : row.scoreOverall >= 40 ? { label: "Needs work", tone: "bg-emce-orange text-white" }
    : { label: "Rework", tone: "bg-emce-red text-white" };

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-emce-light-bg">
        <div className="container max-w-3xl py-6 md:py-8">
          <div className="mb-3 flex items-center justify-between gap-2">
            <Link
              href="/ai-tools/cv-evaluation"
              className="text-hint font-bold text-emce-text-sec hover:text-emce-dark"
            >
              ← Evaluate another CV
            </Link>
            <Button asChild size="sm">
              <Link href="/ai-tools/resume-creator">Rebuild from scratch →</Link>
            </Button>
          </div>

          <Card className="emce-hero-gradient text-white">
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex-1">
                <p className="text-hint font-bold uppercase tracking-wide text-emce-mid">
                  Your CV score
                </p>
                <p className="mt-1 text-5xl font-extrabold leading-none text-white">
                  {row.scoreOverall}
                  <span className="ml-1 text-2xl text-white/60">/100</span>
                </p>
                <Badge className={`mt-3 ${tier.tone}`}>{tier.label}</Badge>
                {row.targetRole && (
                  <p className="mt-2 text-hint text-white/70">
                    Evaluated for: <strong className="text-white">{row.targetRole}</strong>
                    {row.evDomainSlug ? ` · ${row.evDomainSlug.replace(/-/g, " ")}` : ""}
                  </p>
                )}
              </div>
            </div>
          </Card>

          {topFixes.length > 0 && (
            <Card className="mt-4 border-emce-mid">
              <h2 className="text-section text-emce-text">
                If you only fix 3 things, fix these
              </h2>
              <ol className="mt-3 list-decimal space-y-3 pl-5">
                {topFixes.map((f, i) => (
                  <li key={i}>
                    <strong className="text-emce-text">{f.title}</strong>
                    <p className="mt-1 text-sm text-emce-text-sec">{f.body}</p>
                  </li>
                ))}
              </ol>
            </Card>
          )}

          <Card className="mt-4">
            <h2 className="text-section text-emce-text">Section-by-section breakdown</h2>
            <ul className="mt-3 space-y-4">
              {sections.map((s, i) => (
                <SectionCard key={i} section={s} />
              ))}
            </ul>
          </Card>

          <p className="mt-4 text-center text-hint text-emce-text-muted">
            Evaluated on{" "}
            {row.createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}{" "}
            · {row.textLength.toLocaleString()} chars of CV text.
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

function SectionCard({ section }: { section: CvSectionAnalysis }) {
  return (
    <li className="rounded-md border border-emce-border bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-section text-emce-text">{section.section}</h3>
        <span
          className={`rounded-full px-2 py-0.5 text-hint font-bold ${
            section.score >= 70
              ? "bg-emce-light-soft text-emce-darkest"
              : section.score >= 50
              ? "bg-emce-orange-light text-emce-orange-deep"
              : "bg-emce-red-light text-emce-red-deep"
          }`}
        >
          {section.score}/100
        </span>
      </div>
      {section.observation && (
        <p className="mt-2 text-sm text-emce-text-sec">{section.observation}</p>
      )}
      {section.rewrites.length > 0 && (
        <div className="mt-3 rounded-md border border-emce-border bg-emce-light-soft p-3">
          <p className="text-hint font-bold uppercase tracking-wide text-emce-text-muted">
            Rewrite suggestions
          </p>
          <ul className="mt-1 space-y-2 text-sm text-emce-text">
            {section.rewrites.map((r, i) => (
              <li key={i} className="whitespace-pre-wrap">• {r}</li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}
