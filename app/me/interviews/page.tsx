import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "My interviews" };

export default async function MyInterviews() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!profile) redirect("/onboarding");

  const interviews = await db.interview.findMany({
    where: {
      application: { candidateId: profile.id },
    },
    orderBy: { scheduledAt: "asc" },
    include: {
      application: { include: { job: { include: { company: true } } } },
    },
  });

  const upcoming = interviews.filter((i) => i.status === "SCHEDULED" && i.scheduledAt > new Date());
  const past = interviews.filter((i) => i.status !== "SCHEDULED" || i.scheduledAt <= new Date());

  return (
    <div className="container max-w-3xl py-10">
      <h1 className="text-dashboard text-emce-text">My interviews</h1>

      {upcoming.length > 0 && (
        <>
          <h2 className="mt-6 text-section text-emce-text">Upcoming</h2>
          <ul className="mt-3 space-y-3">
            {upcoming.map((i) => (
              <li key={i.id}>
                <Card>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-bold text-emce-text">{i.application.job.title}</div>
                      <div className="text-hint text-emce-text-sec">{i.application.job.company.name}</div>
                      <div className="mt-2 text-body text-emce-text">
                        🗓 {formatDateTime(i.scheduledAt)} · {i.durationMins} min · {i.mode}
                      </div>
                      {i.meetingUrl && (
                        <a
                          href={i.meetingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-block text-hint font-bold text-emce-dark hover:underline"
                        >
                          Join meeting →
                        </a>
                      )}
                      {i.location && (
                        <div className="text-hint text-emce-text-sec">📍 {i.location}</div>
                      )}
                    </div>
                    <Badge variant="success">Scheduled</Badge>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}

      {past.length > 0 && (
        <>
          <h2 className="mt-8 text-section text-emce-text">Past</h2>
          <ul className="mt-3 space-y-3">
            {past.map((i) => (
              <li key={i.id}>
                <Card>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-bold text-emce-text">{i.application.job.title}</div>
                      <div className="text-hint text-emce-text-sec">{i.application.job.company.name}</div>
                      <div className="mt-1 text-hint text-emce-text-muted">
                        {formatDateTime(i.scheduledAt)} · {i.mode}
                      </div>
                    </div>
                    <Badge variant={i.status === "COMPLETED" ? "default" : "outline"}>{i.status}</Badge>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}

      {interviews.length === 0 && (
        <Card className="mt-6 p-10 text-center">
          <div className="text-4xl">📅</div>
          <p className="mt-3 text-section text-emce-text">No interviews yet</p>
          <p className="mt-1 text-hint text-emce-text-sec">
            Once a recruiter schedules an interview, it will appear here with the meeting link or location.
          </p>
          <Button asChild className="mt-4"><Link href="/me/applications">My applications</Link></Button>
        </Card>
      )}
    </div>
  );
}
