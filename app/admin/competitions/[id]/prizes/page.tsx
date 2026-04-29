import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AdminShell } from "@/components/layout/admin-shell";
import { PrizePayoutForm } from "@/components/competitions/AdminReviewActions";
import { formatMinor } from "@/components/mentorship/PriceLabel";

export const metadata = { title: "Competition prizes" };

export default async function AdminCompetitionPrizesPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/403");
  const { id } = await params;

  const competition = await db.competition.findUnique({
    where: { id },
    include: {
      prizes: {
        orderBy: { rank: "asc" },
        include: {
          // We need to look up the awarded registration's leader for paying out.
        },
      },
    },
  });
  if (!competition) notFound();

  const winnerRegs = await db.competitionRegistration.findMany({
    where: { competitionId: id, finalRank: { not: null } },
    include: {
      leader: { select: { email: true, candidateProfile: { select: { firstName: true, lastName: true, slug: true } } } },
    },
  });
  const winnerByRank = new Map(winnerRegs.map((r) => [r.finalRank!, r]));

  return (
    <AdminShell>
      <div className="px-4 py-6 lg:px-8 lg:py-8 space-y-4 max-w-3xl">
        <div>
          <Link href="/admin/competitions" className="text-sm text-emce-text-sec hover:underline">← All competitions</Link>
          <h1 className="mt-1 text-dashboard text-emce-text md:text-3xl">{competition.title} — prizes</h1>
        </div>

        <Card>
          <p className="text-sm text-emce-text-sec">
            Prize money is disbursed manually. Confirm the payout reference (UPI / NEFT) and mark each prize paid once the transfer is done.
          </p>
        </Card>

        <ul className="space-y-3">
          {competition.prizes.length === 0 && <Card className="p-6 text-center text-sm text-emce-text-sec">No prizes configured.</Card>}
          {competition.prizes.map((p) => {
            const winner = winnerByRank.get(p.rank);
            const cp = winner?.leader.candidateProfile;
            const winnerName = cp ? `${cp.firstName} ${cp.lastName ?? ""}`.trim() : winner?.leader.email ?? "—";
            return (
              <Card key={p.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-emce-text">#{p.rank} {p.title}</p>
                    {p.cashAmountMinor > 0 && (
                      <p className="text-section font-bold text-emce-text">{formatMinor(p.cashAmountMinor, p.currency)}</p>
                    )}
                    {p.inKind && <p className="text-hint text-emce-text-sec">+ {p.inKind}</p>}
                    <p className="mt-1 text-hint text-emce-text-sec">
                      Winner: {winner ? <Link href={cp ? `/${cp.slug}` : "#"} className="font-bold text-emce-text hover:underline">{winnerName}</Link> : "Not yet assigned"}
                    </p>
                  </div>
                  <Badge variant={p.payoutStatus === "PAID" ? "verified" : "warning"}>{p.payoutStatus}</Badge>
                </div>
                {winner && p.cashAmountMinor > 0 && p.payoutStatus !== "PAID" && (
                  <div className="mt-3 border-t border-emce-border pt-3">
                    <PrizePayoutForm prizeId={p.id} defaultAmount={p.cashAmountMinor} />
                  </div>
                )}
                {p.payoutStatus === "PAID" && (
                  <p className="mt-2 text-hint text-emce-text-sec">
                    Paid on {p.paidAt?.toLocaleString("en-IN")} · ref {p.payoutExternalRef}
                  </p>
                )}
              </Card>
            );
          })}
        </ul>
      </div>
    </AdminShell>
  );
}
