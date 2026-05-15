import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { JobCard } from "@/components/jobs/JobCard";
import { unsaveJob } from "@/server/jobs/actions";

export const metadata = { title: "Saved jobs" };

export default async function SavedJobsPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin?next=/me/saved");
  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!profile) redirect("/onboarding");

  const saved = await db.savedJob.findMany({
    where: { candidateId: profile.id },
    orderBy: { createdAt: "desc" },
    include: {
      job: {
        include: { company: { select: { name: true, slug: true, logoUrl: true } } },
      },
    },
  });

  return (
    <div className="container max-w-3xl py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-dashboard text-emce-text">Saved jobs</h1>
        <Button asChild variant="outline" size="sm"><Link href="/jobs">Browse jobs →</Link></Button>
      </div>

      {saved.length === 0 ? (
        <Card className="mt-6 p-10 text-center">
          <div className="text-4xl">☆</div>
          <p className="mt-3 text-section text-emce-text">No saved jobs yet</p>
          <p className="mt-1 text-hint text-emce-text-sec">
            Save jobs you&apos;re interested in and come back to them later.
          </p>
        </Card>
      ) : (
        <ul className="emce-stagger mt-6 space-y-3">
          {saved.map((s) => (
            <li key={s.id} className="flex items-start gap-2">
              <div className="flex-1">
                <JobCard job={s.job} />
              </div>
              <form action={unsaveJob}>
                <input type="hidden" name="jobId" value={s.jobId} />
                <ConfirmSubmit confirm="Remove this job from your saved list?" variant="ghost" size="sm">
                  Unsave
                </ConfirmSubmit>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
