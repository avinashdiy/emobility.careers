import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { EmployerShell } from "@/components/layout/employer-shell";
import { unsaveCandidate } from "@/server/employer/actions";

export const metadata = { title: "Saved candidates" };

export default async function SavedCandidates() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "EMPLOYER" && session.user.role !== "ADMIN") redirect("/403");

  const saved = await db.savedCandidate.findMany({
    where: { employerUserId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: {
      candidate: {
        include: {
          evDomains: { include: { evDomain: true } },
        },
      },
    },
  });

  return (
    <EmployerShell>
      <div className="container max-w-4xl py-10">
        <h1 className="text-dashboard text-emce-text">Saved candidates</h1>

        {saved.length === 0 ? (
          <Card className="mt-6 p-10 text-center">
            <div className="text-4xl">☆</div>
            <p className="mt-3 text-section text-emce-text">No saved candidates yet</p>
            <p className="mt-1 text-hint text-emce-text-sec">
              Save profiles to revisit later or invite to apply.
            </p>
            <Button asChild className="mt-4"><Link href="/employer/candidates">Browse candidates →</Link></Button>
          </Card>
        ) : (
          <ul className="mt-6 space-y-3">
            {saved.map((s) => {
              const fullName = [s.candidate.firstName, s.candidate.lastName].filter(Boolean).join(" ");
              return (
                <li key={s.id}>
                  <Card>
                    <div className="flex items-start gap-3">
                      <Avatar src={s.candidate.profilePhotoUrl} name={fullName} size="md" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Link href={`/${s.candidate.slug}`} className="font-bold text-emce-text hover:underline">
                            {fullName}
                          </Link>
                          {s.candidate.isDIYguruVerified && <Badge variant="verified">⭐</Badge>}
                          <Badge variant="default">{s.candidate.profileMode}</Badge>
                        </div>
                        {s.candidate.headline && <p className="text-hint text-emce-text-sec">{s.candidate.headline}</p>}
                        {s.note && <p className="mt-1 text-hint italic text-emce-text-muted">&ldquo;{s.note}&rdquo;</p>}
                      </div>
                      <form action={unsaveCandidate}>
                        <input type="hidden" name="candidateId" value={s.candidateId} />
                        <Button type="submit" variant="ghost" size="sm">Remove</Button>
                      </form>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </EmployerShell>
  );
}
