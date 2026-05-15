import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listMyCompetitions } from "@/server/competitions/queries";

export const metadata = { title: "My competitions" };

export default async function MyCompetitionsPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin?next=/me/competitions");

  const regs = await listMyCompetitions(session.user.id);

  return (
    <div className="container max-w-4xl space-y-4 py-6 md:py-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-dashboard text-emce-text md:text-3xl">My competitions</h1>
          <Button asChild>
            <Link href="/competitions">Browse all →</Link>
          </Button>
        </div>

        <div className="emce-stagger space-y-3">
          {regs.length === 0 && (
            <Card className="p-10 text-center text-sm text-emce-text-sec">
              You haven't registered for any competitions yet.
            </Card>
          )}
          {regs.map((r) => (
            <Card key={r.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Link href={`/competitions/${r.competition.slug}`} className="font-bold text-emce-text hover:underline">
                    {r.competition.title}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge variant={r.status === "WINNER" || r.status === "FINALIST" ? "verified" : "outline"} className="text-[10px]">{r.status}</Badge>
                    <Badge variant="outline" className="text-[10px]">{r.competition.type.replace("_", " ")}</Badge>
                    {r.teamName && <span className="text-xs text-emce-text-sec">Team: {r.teamName}</span>}
                  </div>
                  <p className="mt-1 text-hint text-emce-text-sec">
                    {r.competition.startsAt.toLocaleDateString("en-IN")} → {r.competition.endsAt.toLocaleDateString("en-IN")}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/competitions/${r.competition.slug}`}>Details</Link>
                  </Button>
                  <Button asChild size="sm">
                    <Link href={`/competitions/${r.competition.slug}/submit`}>Submit</Link>
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
    </div>
  );
}
