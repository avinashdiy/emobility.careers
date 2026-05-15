import { notFound, redirect } from "next/navigation";
import { signinNextUrl } from "@/lib/auth-redirect";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { EmployerShell } from "@/components/layout/employer-shell";
import { JudgeForm } from "@/components/competitions/JudgeForm";
import { getCompetitionForHost, getSubmissionsForJudge } from "@/server/competitions/queries";

export const metadata = { title: "Judge submissions" };

export default async function JudgePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect(await signinNextUrl());
  const { id } = await params;

  // Either the host or an invited judge can land here.
  const competition = await db.competition.findUnique({
    where: { id },
    select: { id: true, slug: true, title: true, judgingCriteria: true },
  });
  if (!competition) notFound();

  // Authz: must be host OR a CompetitionJudge row exists.
  const [hostMatch, isJudge] = await Promise.all([
    getCompetitionForHost(id, session.user.id),
    db.competitionJudge.findFirst({ where: { competitionId: id, judgeUserId: session.user.id } }),
  ]);
  if (!hostMatch && !isJudge) notFound();

  const submissions = await getSubmissionsForJudge(id, session.user.id);

  const criteria = (Array.isArray(competition.judgingCriteria)
    ? (competition.judgingCriteria as { name: string; weight?: number; description?: string }[])
    : []);

  return (
    <EmployerShell>
      <div className="container max-w-4xl space-y-4 py-6">
        <div>
          <Link href={hostMatch ? `/employer/competitions/${id}` : "/me/competitions"} className="text-sm text-emce-text-sec hover:underline">
            ← Back
          </Link>
          <h1 className="mt-1 text-dashboard text-emce-text md:text-3xl">Judge: {competition.title}</h1>
        </div>

        {submissions.length === 0 && (
          <Card className="p-10 text-center text-sm text-emce-text-sec">No submissions to judge yet.</Card>
        )}

        {submissions.map((s) => (
          <JudgeForm key={s.id} submission={s} criteria={criteria} />
        ))}
      </div>
    </EmployerShell>
  );
}
