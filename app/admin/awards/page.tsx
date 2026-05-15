import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminShell } from "@/components/layout/admin-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { computeAwardsAction } from "@/server/reviews/admin-actions";

export const metadata = { title: "Best EV Employer awards" };

export default async function AdminAwardsPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "ADMIN") redirect("/403");

  const year = new Date().getFullYear();
  const [awards, reviewCount] = await Promise.all([
    db.employerAward.findMany({
      where: { year },
      orderBy: [{ category: "asc" }, { rank: "asc" }],
      include: { company: { select: { name: true, slug: true } } },
    }),
    db.companyReview.count({
      where: {
        status: "PUBLISHED",
        createdAt: {
          gte: new Date(Date.UTC(year, 0, 1)),
          lt: new Date(Date.UTC(year + 1, 0, 1)),
        },
      },
    }),
  ]);

  return (
    <AdminShell>
      <div className="container max-w-4xl space-y-6 py-10">
        <header>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emce-mid-muted">
            🏆 Best EV Employer · admin
          </p>
          <h1 className="mt-1 text-2xl font-extrabold text-emce-text">
            {year} awards
          </h1>
          <p className="mt-1 text-hint text-emce-text-sec">
            {reviewCount} published reviews this year. Click compute to re-rank
            companies into EmployerAward rows by category. Re-running is safe
            — upserts by (companyId, year, category).
          </p>
        </header>

        <Card>
          <form action={computeAwardsAction}>
            <input type="hidden" name="year" value={String(year)} />
            <SubmitButton variant="glow" pendingLabel="Computing…">
              ⚡ Compute {year} rankings
            </SubmitButton>
          </form>
          <p className="mt-2 text-hint text-emce-text-muted">
            Public award page lives at{" "}
            <Link href="/awards" className="font-bold text-emce-dark hover:underline">
              /awards
            </Link>{" "}
            and renders the latest computed rankings.
          </p>
        </Card>

        <div>
          <h2 className="text-section text-emce-text">Current rankings</h2>
          {awards.length === 0 ? (
            <Card className="mt-3 p-6 text-hint text-emce-text-sec">
              No rankings yet. Hit compute above once you have ≥5 reviews per
              category for at least one company.
            </Card>
          ) : (
            <ul className="emce-stagger mt-3 space-y-2">
              {awards.map((a) => (
                <li key={a.id}>
                  <Card>
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="font-bold text-emce-text">
                        #{a.rank} · {a.company.name}
                      </p>
                      <Badge variant="default">
                        {a.category.replace(/_/g, " ").toLowerCase()}
                      </Badge>
                    </div>
                    <p className="mt-1 text-hint text-emce-text-muted">
                      Awarded {new Date(a.awardedAt).toLocaleDateString("en-IN")}
                    </p>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
