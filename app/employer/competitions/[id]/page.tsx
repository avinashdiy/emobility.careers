import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { signinNextUrl } from "@/lib/auth-redirect";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmployerShell } from "@/components/layout/employer-shell";
import { CompetitionDraftForm } from "@/components/competitions/CompetitionDraftForm";
import { StagePrizeManager } from "@/components/competitions/StagePrizeManager";
import { ResultsAnnouncer } from "@/components/competitions/ResultsAnnouncer";
import { getCompetitionForHost, getRegistrationsForHost } from "@/server/competitions/queries";

export default async function HostCompetitionPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect(await signinNextUrl());
  if (session.user.role !== "EMPLOYER" && session.user.role !== "ADMIN") redirect("/403");
  const { id } = await params;

  const c = await getCompetitionForHost(id, session.user.id);
  if (!c) notFound();
  const [evDomains, jobs, registrations] = await Promise.all([
    db.eVDomain.findMany({ orderBy: { order: "asc" }, select: { slug: true, name: true } }),
    db.jobPosting.findMany({
      where: { companyId: c.hostCompanyId, status: { in: ["OPEN", "DRAFT"] } },
      select: { id: true, title: true },
    }),
    getRegistrationsForHost(c.id),
  ]);

  return (
    <EmployerShell>
      <div className="container max-w-5xl space-y-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <Link href="/employer/competitions" className="text-sm text-emce-text-sec hover:underline">← All competitions</Link>
            <h1 className="mt-1 text-dashboard text-emce-text md:text-3xl">{c.title}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge variant={c.status === "LIVE" ? "verified" : c.status === "PENDING_REVIEW" ? "warning" : "outline"}>{c.status}</Badge>
              {c.publishedAt && (
                <Link href={`/competitions/${c.slug}`} className="text-xs text-emce-text-sec hover:underline">/competitions/{c.slug}</Link>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/employer/competitions/${c.id}/judge`}>Judge submissions →</Link>
            </Button>
          </div>
        </div>

        {c.reviewerNotes && c.status === "CHANGES_REQUESTED" && (
          <Card className="border-emce-red">
            <p className="text-sm text-emce-red-deep"><strong>Reviewer:</strong> {c.reviewerNotes}</p>
          </Card>
        )}

        <CompetitionDraftForm
          hostCompanyId={c.hostCompanyId}
          initial={{
            id: c.id,
            title: c.title,
            tagline: c.tagline,
            description: c.description,
            type: c.type,
            bannerImageUrl: c.bannerImageUrl,
            eligibility: c.eligibility,
            rules: c.rules,
            isTeamBased: c.isTeamBased,
            minTeamSize: c.minTeamSize,
            maxTeamSize: c.maxTeamSize,
            registrationOpensAt: c.registrationOpensAt,
            registrationClosesAt: c.registrationClosesAt,
            startsAt: c.startsAt,
            endsAt: c.endsAt,
            resultsAt: c.resultsAt,
            totalPrizePoolMinor: c.totalPrizePoolMinor,
            prizeCurrency: c.prizeCurrency,
            evDomainSlugs: c.evDomainSlugs,
          }}
          evDomains={evDomains}
        />

        <StagePrizeManager
          competitionId={c.id}
          status={c.status}
          stages={c.stages}
          prizes={c.prizes}
          perks={c.perks}
          jobs={jobs}
        />

        {(c.status === "LIVE" || c.status === "JUDGING" || c.status === "RESULTS") && (
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-section text-emce-text">Registrations ({registrations.length})</h2>
              {c.status !== "RESULTS" && <ResultsAnnouncer competitionId={c.id} />}
            </div>
            <ul className="mt-3 divide-y divide-emce-border">
              {registrations.map((r) => {
                const cp = r.leader.candidateProfile;
                const name = cp ? `${cp.firstName} ${cp.lastName ?? ""}`.trim() : r.leader.email;
                return (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <div>
                      <span className="font-bold text-emce-text">{r.teamName ?? name}</span>
                      <span className="ml-2 text-xs text-emce-text-sec">{r.members.length} member{r.members.length === 1 ? "" : "s"} · {r.submissions.length} submission{r.submissions.length === 1 ? "" : "s"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={r.status === "WINNER" ? "verified" : "outline"} className="text-[10px]">{r.status}</Badge>
                      {r.finalRank != null && <span className="text-xs text-emce-text-sec">Rank #{r.finalRank}</span>}
                    </div>
                  </li>
                );
              })}
              {registrations.length === 0 && <li className="py-3 text-sm text-emce-text-sec">No registrations yet.</li>}
            </ul>
          </Card>
        )}
      </div>
    </EmployerShell>
  );
}
