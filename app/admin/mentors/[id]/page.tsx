import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AdminShell } from "@/components/layout/admin-shell";
import { getPayoutLedger } from "@/server/mentorship/queries";
import { MentorPayoutForm } from "@/components/mentorship/MentorReviewActions";
import { formatMinor } from "@/components/mentorship/PriceLabel";
import { htmlOrFallback } from "@/lib/cms/job-sanitize";

export default async function AdminMentorDetail({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/403");
  const { id } = await params;

  const mentor = await db.mentorProfile.findUnique({
    where: { id },
    include: { user: { select: { email: true, candidateProfile: { select: { firstName: true, lastName: true, slug: true } } } } },
  });
  if (!mentor) notFound();
  const ledger = await getPayoutLedger(mentor.id);

  const cp = mentor.user.candidateProfile;
  const name = cp ? `${cp.firstName} ${cp.lastName ?? ""}`.trim() : mentor.user.email;

  return (
    <AdminShell>
      <div className="px-4 py-6 lg:px-8 lg:py-8 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-dashboard text-emce-text md:text-3xl">{name}</h1>
          <Link href="/admin/mentors" className="text-sm text-emce-text-sec hover:underline">← Back to queue</Link>
        </div>

        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={mentor.kycStatus === "APPROVED" ? "verified" : "warning"}>{mentor.kycStatus}</Badge>
            {mentor.isPublished && <Badge variant="verified">Published</Badge>}
            <span className="text-sm text-emce-text-sec">{mentor.user.email}</span>
          </div>
          <p className="mt-3 text-sm text-emce-text">{mentor.headline}</p>
          <div
            className="prose prose-sm mt-1 max-w-none text-sm text-emce-text-sec"
            dangerouslySetInnerHTML={{ __html: htmlOrFallback(mentor.bio) }}
          />
        </Card>

        <Card>
          <h2 className="text-section text-emce-text">Payouts</h2>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            <div>
              <div className="text-xs uppercase text-emce-text-sec">Earned</div>
              <div className="text-section font-bold">{formatMinor(ledger.earnedMinor, mentor.currency)}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-emce-text-sec">Paid out</div>
              <div className="text-section font-bold">{formatMinor(ledger.paidOutMinor, mentor.currency)}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-emce-text-sec">Owed</div>
              <div className="text-section font-bold text-emce-mid">{formatMinor(ledger.owedMinor, mentor.currency)}</div>
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-sm font-bold text-emce-text">Record a payout</h3>
            <div className="mt-2">
              <MentorPayoutForm mentorId={mentor.id} owedMinor={ledger.owedMinor} />
            </div>
          </div>

          <h3 className="mt-6 text-sm font-bold text-emce-text">Payout history</h3>
          <ul className="mt-2 divide-y divide-emce-border text-sm">
            {ledger.payouts.length === 0 && <li className="py-3 text-emce-text-sec">No payouts yet.</li>}
            {ledger.payouts.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2">
                <span>{formatMinor(p.amountMinor, p.currency)} · {p.status} · {p.paidAt?.toLocaleDateString("en-IN") ?? "—"}</span>
                <span className="text-emce-text-sec">{p.externalRef}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </AdminShell>
  );
}
