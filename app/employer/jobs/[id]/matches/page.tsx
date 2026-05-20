import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { signinNextUrl } from "@/lib/auth-redirect";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { EmployerShell } from "@/components/layout/employer-shell";
import { ToastFromSearchParams } from "@/components/ui/toast-from-params";
import { matchCandidatesForJob, buildCandidateBriefs } from "@/server/matching/score";
import { rerankMatches, type RerankedCandidate } from "@/lib/ai/rerank";
import { jobEmbeddingText } from "@/lib/ai/embeddings";
import { InviteableMatchList } from "@/components/matching/InviteablyMatchList";

export default async function MatchesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ diyguruOnly?: string; openToWorkOnly?: string; rerank?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const session = await auth();
  if (!session?.user) redirect(await signinNextUrl());
  const employer = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!employer) redirect("/employer/onboarding");

  const job = await db.jobPosting.findUnique({
    where: { id },
    include: {
      company: true,
      skills: { include: { skill: true } },
      evDomains: { include: { evDomain: true } },
    },
  });
  if (!job) notFound();
  if (session.user.role !== "ADMIN" && job.companyId !== employer.companyId) redirect("/403");

  const matches = await matchCandidatesForJob({
    jobId: id,
    limit: 50,
    diyguruOnly: sp.diyguruOnly === "true",
    openToWorkOnly: sp.openToWorkOnly === "true",
  });

  // Optional GPT-4o re-rank for explainability
  let reranked: RerankedCandidate[] = matches.map((m) => ({
    ...m,
    rerankScore: m.finalScore,
    rerankReason: "",
    combinedScore: m.finalScore,
  }));
  if (sp.rerank === "true" && matches.length > 0) {
    const briefs = await buildCandidateBriefs(matches.map((m) => m.candidateId));
    reranked = await rerankMatches(jobEmbeddingText(job), matches, briefs, { topN: 25 });
  }

  return (
    <EmployerShell>
      <div className="container max-w-5xl py-6">
        <ToastFromSearchParams />
        <div className="mb-4 flex items-center justify-between">
          <div>
            <Link href={`/employer/jobs/${id}`} className="text-hint font-bold text-emce-text-sec hover:text-emce-dark">
              ← Job detail
            </Link>
            <h1 className="mt-1 text-dashboard text-emce-text">AI matches — {job.title}</h1>
            <p className="text-hint text-emce-text-sec">
              Hybrid score: 50% semantic similarity + 25% skill overlap + 15% domain + 10% DIYguru boost
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href={`/employer/jobs/${id}/ats`}>← Back to ATS</Link>
          </Button>
        </div>

        <Card className="mb-4 p-4">
          <form className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2 text-emce-text-sec">
              <input
                type="checkbox"
                name="diyguruOnly"
                value="true"
                defaultChecked={sp.diyguruOnly === "true"}
                className="h-4 w-4 accent-emce-mid"
              />
              DIYguru-verified only
            </label>
            <label className="flex items-center gap-2 text-emce-text-sec">
              <input
                type="checkbox"
                name="openToWorkOnly"
                value="true"
                defaultChecked={sp.openToWorkOnly === "true"}
                className="h-4 w-4 accent-emce-mid"
              />
              Open to work only
            </label>
            <label className="flex items-center gap-2 text-emce-text-sec">
              <input
                type="checkbox"
                name="rerank"
                value="true"
                defaultChecked={sp.rerank === "true"}
                className="h-4 w-4 accent-emce-mid"
              />
              ✨ AI re-rank with explanations (top 25)
            </label>
            <Button type="submit" size="sm">Apply filters</Button>
          </form>
        </Card>

        {matches.length === 0 ? (
          <Card className="p-10 text-center">
            <div className="text-4xl">🤖</div>
            <p className="mt-3 text-section text-emce-text">No matches yet</p>
            <p className="mt-1 text-hint text-emce-text-sec">
              We need profile embeddings to rank — once candidates upload resumes, they&apos;ll appear here.
            </p>
          </Card>
        ) : (
          <InviteableMatchList jobId={id} matches={reranked} />
        )}
      </div>
    </EmployerShell>
  );
}
