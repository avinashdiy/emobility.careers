import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { getRankedJdsForCandidate } from "@/lib/recruitathon/jd-matching";
import { JdSelector, type SelectorCompany } from "@/components/recruitathon/JdSelector";

/**
 * JD selection — the candidate browses the hiring companies, sees their
 * roles ranked by an AI profile→JD match, and picks up to 3 to be
 * tested on. Gated only behind having a CV on file (the AI parse of
 * which supplies the matching signal) — no completeness threshold.
 */
export const dynamic = "force-dynamic";

export default async function RecruitathonSelectPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const session = await auth();
  if (!session?.user) redirect(`/recruitathon/onboarding?next=${encodeURIComponent("/recruitathon/select")}`);

  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true, resumeUrl: true, resumeParseDraft: true, resumeParsedAt: true },
  });
  if (!profile) redirect("/recruitathon/onboarding");

  // Requirement: the details step is done — either the CV parse was
  // reviewed & applied, OR details were entered manually (resumeParsedAt
  // is stamped in both cases). No CV file is required. A pending draft
  // (unconfirmed review) sends them back to finish it.
  if (profile.resumeParseDraft || !profile.resumeParsedAt) {
    redirect(`/recruitathon/onboarding?next=${encodeURIComponent("/recruitathon/select")}`);
  }

  // The drive whose JD catalog we're selecting from. Pick an active JD
  // that actually HAS a drive (an arbitrary first active JD might have a
  // null driveId and wrongly trip the "no roles" empty state).
  const anyJd = await db.recruitathonJd.findFirst({ where: { isActive: true, driveId: { not: null } }, select: { driveId: true } });
  if (!anyJd?.driveId) {
    return (
      <>
        <SiteHeader />
        <main className="container max-w-2xl py-16 text-center text-emce-text-sec">No test roles are published yet — check back shortly.</main>
        <SiteFooter />
      </>
    );
  }

  const ranked = await getRankedJdsForCandidate(profile.id, anyJd.driveId);
  const existing = await db.recruitathonJdSelection.findMany({ where: { candidateId: profile.id }, select: { jdId: true } });
  const preselected = existing.map((e) => e.jdId);

  // Group by company; sort companies + roles by best match desc.
  const byCompany = new Map<string, SelectorCompany>();
  for (const { jd, match } of ranked) {
    const entry = byCompany.get(jd.company) ?? { company: jd.company, bestScore: 0, jds: [] };
    entry.jds.push({
      id: jd.id, role: jd.role, level: jd.level, eligibility: jd.eligibility,
      location: jd.location, description: jd.description, skills: jd.skills,
      score: match.score, reason: match.reason,
    });
    entry.bestScore = Math.max(entry.bestScore, match.score);
    byCompany.set(jd.company, entry);
  }
  const companies = Array.from(byCompany.values())
    .map((c) => ({ ...c, jds: c.jds.sort((a, b) => b.score - a.score) }))
    .sort((a, b) => b.bestScore - a.bestScore);

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-emce-light-bg">
        <div className="container max-w-2xl py-8 md:py-10">
          <p className="text-hint font-bold uppercase tracking-wide text-emce-mid-muted">Choose your tests</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-emce-text md:text-3xl">Pick up to 3 roles</h1>
          <p className="mt-2 text-sm text-emce-text-sec">
            We&apos;ve matched every open role to your profile — <strong>higher % = better fit</strong>. Tap a company to see its roles,
            then select up to three to be tested on. You can override our suggestions and pick any role you like.
          </p>

          {sp.error && <p className="mt-4 rounded-md bg-emce-red-light p-3 text-sm font-semibold text-emce-red-deep">{sp.error}</p>}

          <div className="mt-5">
            <JdSelector companies={companies} preselected={preselected} />
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
