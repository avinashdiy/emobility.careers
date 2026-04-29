import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getMyMentorshipSessions } from "@/server/mentorship/queries";
import { SessionRow } from "@/components/mentorship/SessionRow";

export const metadata = { title: "My mentorship sessions" };

export default async function MySessionsPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin?next=/me/sessions");

  const sessions = await getMyMentorshipSessions(session.user.id);
  const reviewed = await db.mentorshipReview.findMany({
    where: { reviewerUserId: session.user.id },
    select: { sessionId: true },
  });
  const reviewedSet = new Set(reviewed.map((r) => r.sessionId));

  const upcoming = sessions.filter((s) => (s.status === "CONFIRMED" || s.status === "PENDING_PAYMENT") && s.scheduledAt > new Date());
  const past = sessions.filter((s) => !upcoming.includes(s));

  return (
    <div className="container max-w-4xl space-y-4 py-6 md:py-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-dashboard text-emce-text md:text-3xl">My mentorship sessions</h1>
            <p className="mt-1 text-sm text-emce-text-sec">{upcoming.length} upcoming · {past.length} past</p>
          </div>
          <Button asChild>
            <Link href="/mentors">Find a mentor →</Link>
          </Button>
        </div>

        <div>
          <h2 className="text-section text-emce-text">Upcoming</h2>
          <div className="mt-2 space-y-3">
            {upcoming.length === 0 && <Card className="p-6 text-center text-sm text-emce-text-sec">No upcoming sessions yet.</Card>}
            {upcoming.map((s) => {
              const cp = s.mentor.user.candidateProfile;
              const name = cp ? `${cp.firstName} ${cp.lastName ?? ""}`.trim() : "Mentor";
              return (
                <SessionRow
                  key={s.id}
                  perspective="mentee"
                  s={{
                    id: s.id,
                    scheduledAt: s.scheduledAt.toISOString(),
                    durationMins: s.durationMins,
                    mode: s.mode,
                    status: s.status,
                    paymentStatus: s.paymentStatus,
                    topic: s.topic,
                    meetingUrl: s.meetingUrl,
                    priceMinor: s.priceMinor,
                    currency: s.currency,
                    hasReview: reviewedSet.has(s.id),
                    counterpart: { name, photoUrl: cp?.profilePhotoUrl ?? null, slug: cp?.slug },
                  }}
                />
              );
            })}
          </div>
        </div>

        <div>
          <h2 className="text-section text-emce-text">Past</h2>
          <div className="mt-2 space-y-3">
            {past.length === 0 && <Card className="p-6 text-center text-sm text-emce-text-sec">No past sessions.</Card>}
            {past.slice(0, 30).map((s) => {
              const cp = s.mentor.user.candidateProfile;
              const name = cp ? `${cp.firstName} ${cp.lastName ?? ""}`.trim() : "Mentor";
              return (
                <SessionRow
                  key={s.id}
                  perspective="mentee"
                  s={{
                    id: s.id,
                    scheduledAt: s.scheduledAt.toISOString(),
                    durationMins: s.durationMins,
                    mode: s.mode,
                    status: s.status,
                    paymentStatus: s.paymentStatus,
                    topic: s.topic,
                    meetingUrl: s.meetingUrl,
                    priceMinor: s.priceMinor,
                    currency: s.currency,
                    hasReview: reviewedSet.has(s.id),
                    counterpart: { name, photoUrl: cp?.profilePhotoUrl ?? null, slug: cp?.slug },
                  }}
                />
              );
            })}
          </div>
        </div>
    </div>
  );
}
