import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getMentorByUserId, getMentorshipBookingsForMentor, getPayoutLedger } from "@/server/mentorship/queries";
import { SessionRow } from "@/components/mentorship/SessionRow";
import { formatMinor } from "@/components/mentorship/PriceLabel";

export const metadata = { title: "Mentor inbox" };

export default async function MentorSessionsPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin?next=/me/mentor/sessions");
  const mentor = await getMentorByUserId(session.user.id);
  if (!mentor) redirect("/me/mentor");

  const [bookings, ledger] = await Promise.all([
    getMentorshipBookingsForMentor(session.user.id),
    getPayoutLedger(mentor.id),
  ]);

  const upcoming = bookings.filter((b) => b.status === "CONFIRMED" || b.status === "PENDING_PAYMENT")
    .filter((b) => b.scheduledAt > new Date());
  const past = bookings.filter((b) => !upcoming.includes(b));

  return (
    <div className="container max-w-4xl space-y-4 py-6 md:py-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-dashboard text-emce-text md:text-3xl">Booking inbox</h1>
            <p className="mt-1 text-sm text-emce-text-sec">{upcoming.length} upcoming · {past.length} past</p>
          </div>
          <Button asChild variant="outline">
            <Link href="/me/mentor">← Profile</Link>
          </Button>
        </div>

        <Card>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <div className="text-xs uppercase text-emce-text-sec">Earned (PAID)</div>
              <div className="text-section font-bold text-emce-text">{formatMinor(ledger.earnedMinor, mentor.currency)}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-emce-text-sec">Paid out</div>
              <div className="text-section font-bold text-emce-text">{formatMinor(ledger.paidOutMinor, mentor.currency)}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-emce-text-sec">Owed to you</div>
              <div className="text-section font-bold text-emce-mid">{formatMinor(ledger.owedMinor, mentor.currency)}</div>
            </div>
          </div>
          <p className="mt-2 text-hint text-emce-text-sec">
            Payouts are settled manually by the eMobility Careers team — typically every 30 days.
          </p>
        </Card>

        <div>
          <h2 className="text-section text-emce-text">Upcoming</h2>
          <div className="mt-2 space-y-3">
            {upcoming.length === 0 && (
              <Card className="p-6 text-center text-sm text-emce-text-sec">No upcoming sessions.</Card>
            )}
            {upcoming.map((b) => (
              <SessionRow
                key={b.id}
                perspective="mentor"
                s={{
                  id: b.id,
                  scheduledAt: b.scheduledAt.toISOString(),
                  durationMins: b.durationMins,
                  mode: b.mode,
                  status: b.status,
                  paymentStatus: b.paymentStatus,
                  topic: b.topic,
                  meetingUrl: b.meetingUrl,
                  priceMinor: b.priceMinor,
                  currency: b.currency,
                  hasReview: false,
                  counterpart: {
                    name: b.mentee.candidateProfile
                      ? `${b.mentee.candidateProfile.firstName} ${b.mentee.candidateProfile.lastName ?? ""}`.trim()
                      : b.mentee.email,
                    photoUrl: b.mentee.candidateProfile?.profilePhotoUrl ?? null,
                    slug: b.mentee.candidateProfile?.slug,
                  },
                }}
              />
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-section text-emce-text">Past</h2>
          <div className="mt-2 space-y-3">
            {past.length === 0 && (
              <Card className="p-6 text-center text-sm text-emce-text-sec">No past sessions.</Card>
            )}
            {past.slice(0, 30).map((b) => (
              <SessionRow
                key={b.id}
                perspective="mentor"
                s={{
                  id: b.id,
                  scheduledAt: b.scheduledAt.toISOString(),
                  durationMins: b.durationMins,
                  mode: b.mode,
                  status: b.status,
                  paymentStatus: b.paymentStatus,
                  topic: b.topic,
                  meetingUrl: b.meetingUrl,
                  priceMinor: b.priceMinor,
                  currency: b.currency,
                  hasReview: false,
                  counterpart: {
                    name: b.mentee.candidateProfile
                      ? `${b.mentee.candidateProfile.firstName} ${b.mentee.candidateProfile.lastName ?? ""}`.trim()
                      : b.mentee.email,
                    photoUrl: b.mentee.candidateProfile?.profilePhotoUrl ?? null,
                    slug: b.mentee.candidateProfile?.slug,
                  },
                }}
              />
            ))}
          </div>
        </div>
    </div>
  );
}
