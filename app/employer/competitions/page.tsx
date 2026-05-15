import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmployerShell } from "@/components/layout/employer-shell";

export const metadata = { title: "Competitions" };

export default async function EmployerCompetitionsList() {
  const session = await auth();
  if (!session?.user) redirect("/signin?next=/employer/competitions");
  if (session.user.role !== "EMPLOYER" && session.user.role !== "ADMIN") redirect("/403");

  const employer = await db.employerProfile.findUnique({ where: { userId: session.user.id } });
  if (!employer) redirect("/employer/onboarding");

  const competitions = await db.competition.findMany({
    where: { hostCompanyId: employer.companyId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { registrations: true } } },
  });

  return (
    <EmployerShell>
      <div className="container max-w-5xl space-y-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-dashboard text-emce-text md:text-3xl">Competitions</h1>
          <Button asChild variant="accent">
            <Link href="/employer/competitions/new">+ New competition</Link>
          </Button>
        </div>

        <Card>
          <p className="text-sm text-emce-text-sec">
            Hosting competitions is optional — useful for awareness, recruitment funnels, or just paying out prize money for a great challenge.
            Drafts go through admin review before being visible to candidates.
          </p>
        </Card>

        <div className="emce-stagger space-y-2">
          {competitions.length === 0 && (
            <Card className="p-10 text-center text-sm text-emce-text-sec">
              No competitions yet. Click + New competition to draft one.
            </Card>
          )}
          {competitions.map((c) => (
            <Card key={c.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Link href={`/employer/competitions/${c.id}`} className="font-bold text-emce-text hover:underline">
                    {c.title}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge variant={c.status === "LIVE" ? "verified" : c.status === "PENDING_REVIEW" ? "warning" : "outline"} className="text-[10px]">{c.status}</Badge>
                    <span className="text-xs text-emce-text-sec">{c._count.registrations} registered · {c.submissionsCount} submissions</span>
                  </div>
                </div>
                <div className="text-xs text-emce-text-sec">
                  {c.startsAt.toLocaleDateString("en-IN")} → {c.endsAt.toLocaleDateString("en-IN")}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </EmployerShell>
  );
}
