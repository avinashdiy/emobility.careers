import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/brand/Logo";
import { withdrawApplication } from "@/server/jobs/actions";
import { relativeTime } from "@/lib/utils";
import { getCandidateApplicationStats } from "@/lib/applications-stats";
import { ApplicationTracker } from "@/components/candidate/ApplicationTracker";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "My applications" };

const STAGE_LABELS: Record<string, { label: string; variant: "default" | "success" | "warning" | "danger" | "outline" }> = {
  APPLIED: { label: "Applied", variant: "default" },
  SCREENED: { label: "Screened", variant: "default" },
  SHORTLISTED: { label: "Shortlisted", variant: "success" },
  ASSESSMENT: { label: "Assessment", variant: "warning" },
  INTERVIEW: { label: "Interview", variant: "warning" },
  OFFER: { label: "Offer", variant: "success" },
  HIRED: { label: "Hired 🎉", variant: "success" },
  REJECTED: { label: "Not selected", variant: "danger" },
  WITHDRAWN: { label: "Withdrawn", variant: "outline" },
};

export default async function MyApplications({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/signin?next=/me/applications");
  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!profile) redirect("/onboarding");

  const sp = await searchParams;

  const [applications, stats] = await Promise.all([
    db.application.findMany({
      where: { candidateId: profile.id },
      orderBy: { appliedAt: "desc" },
      include: {
        job: {
          include: { company: { select: { name: true, slug: true, logoUrl: true } } },
        },
      },
    }),
    getCandidateApplicationStats(profile.id),
  ]);

  return (
    <div className="min-h-screen bg-emce-light-bg">
      <header className="border-b border-emce-border bg-white">
        <div className="container flex h-14 items-center justify-between">
          <Link href="/" aria-label="Home" className="flex items-center">
            <Logo size="md" />
          </Link>
          <Button asChild variant="ghost" size="sm"><Link href="/me">Dashboard</Link></Button>
        </div>
      </header>

      <main className="container max-w-4xl space-y-6 py-10">
        <PageHeader
          title="My applications"
          subtitle={`${applications.length} total`}
        />

        {applications.length > 0 && <ApplicationTracker stats={stats} />}

        {sp.notice && (
          <div className="rounded-md bg-emce-light-soft p-3 text-sm text-emce-dark">{sp.notice}</div>
        )}

        {applications.length === 0 ? (
          <EmptyState
            icon="📨"
            title="No applications yet"
            body="Browse jobs and apply with your profile in one click."
            action={
              <Button asChild>
                <Link href="/jobs">Find jobs →</Link>
              </Button>
            }
          />
        ) : (
          <ul className="space-y-3">
            {applications.map((a) => {
              const stageInfo = STAGE_LABELS[a.stage] ?? STAGE_LABELS.APPLIED;
              return (
                <li key={a.id}>
                  <Card>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-3">
                        <div className="grid h-11 w-11 place-items-center overflow-hidden rounded-md bg-emce-light-soft text-base font-extrabold text-emce-dark">
                          {a.job.company.logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={a.job.company.logoUrl} alt={a.job.company.name} className="h-full w-full object-cover" />
                          ) : (
                            a.job.company.name[0]?.toUpperCase()
                          )}
                        </div>
                        <div>
                          <Link href={`/job/${a.job.slug}`} className="font-bold text-emce-text hover:underline">
                            {a.job.title}
                          </Link>
                          <p className="text-hint text-emce-text-sec">
                            {a.job.company.name} · Applied {relativeTime(a.appliedAt)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={stageInfo.variant}>{stageInfo.label}</Badge>
                        {!["WITHDRAWN", "REJECTED", "HIRED"].includes(a.stage) && (
                          <form action={withdrawApplication}>
                            <input type="hidden" name="id" value={a.id} />
                            <ConfirmSubmit
                              confirm={`Withdraw your application for "${a.job.title}"? This can't be undone.`}
                              variant="ghost"
                              size="sm"
                              pendingLabel="Withdrawing…"
                            >
                              Withdraw
                            </ConfirmSubmit>
                          </form>
                        )}
                      </div>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
