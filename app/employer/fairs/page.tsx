import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmployerShell } from "@/components/layout/employer-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Recruitment drives" };
export const dynamic = "force-dynamic";

/**
 * Recruiter list of recruitment drives their company is on. Three
 * sections: pending invites (call to action), confirmed (active
 * booth management), past (recap + applicant queue access).
 */
export default async function EmployerFairsPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin?next=/employer/fairs");
  if (session.user.role !== "EMPLOYER" && session.user.role !== "ADMIN") {
    redirect("/403");
  }
  const employer = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
    select: { companyId: true },
  });
  if (!employer?.companyId) redirect("/employer");

  const participations = await db.recruitmentDriveCompany.findMany({
    where: { companyId: employer.companyId },
    orderBy: { invitedAt: "desc" },
    include: {
      drive: {
        select: {
          id: true,
          slug: true,
          title: true,
          city: true,
          startsAt: true,
          endsAt: true,
          status: true,
        },
      },
      _count: { select: { driveJobs: true } },
    },
  });

  const pending = participations.filter((p) => p.status === "INVITED");
  const confirmed = participations.filter(
    (p) => p.status === "CONFIRMED" && p.drive.status !== "CLOSED",
  );
  const past = participations.filter(
    (p) => p.status === "CONFIRMED" && p.drive.status === "CLOSED",
  );

  return (
    <EmployerShell>
      <div className="container max-w-5xl space-y-6 py-6 md:py-8">
        <PageHeader
          title="Recruitment drives"
          subtitle="Multi-company job fairs your company is invited to or participating in."
        />

        {participations.length === 0 ? (
          <EmptyState
            icon="🪪"
            title="No fair invitations yet"
            body="Admins invite companies to recruitment drives. We'll notify you the moment yours arrives — set your inbox preferences from /me/preferences."
          />
        ) : (
          <>
            {pending.length > 0 && (
              <Section title="Pending invitations" hint="Confirm to set up your booth.">
                <ul className="emce-stagger space-y-2">
                  {pending.map((p) => (
                    <ParticipationRow key={p.id} p={p} />
                  ))}
                </ul>
              </Section>
            )}
            {confirmed.length > 0 && (
              <Section title="Active booths" hint="Attach jobs, edit your booth pitch, review applicants.">
                <ul className="emce-stagger space-y-2">
                  {confirmed.map((p) => (
                    <ParticipationRow key={p.id} p={p} />
                  ))}
                </ul>
              </Section>
            )}
            {past.length > 0 && (
              <Section title="Past fairs" hint="Applicant queues stay accessible after the fair closes.">
                <ul className="emce-stagger space-y-2">
                  {past.map((p) => (
                    <ParticipationRow key={p.id} p={p} />
                  ))}
                </ul>
              </Section>
            )}
          </>
        )}
      </div>
    </EmployerShell>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-section text-emce-text">{title}</h2>
      {hint && <p className="text-hint text-emce-text-sec">{hint}</p>}
      <div className="mt-2">{children}</div>
    </section>
  );
}

function ParticipationRow({
  p,
}: {
  p: {
    id: string;
    status: string;
    boothLabel: string | null;
    drive: {
      id: string;
      slug: string;
      title: string;
      city: string;
      startsAt: Date;
      endsAt: Date;
      status: string;
    };
    _count: { driveJobs: number };
  };
}) {
  return (
    <li>
      <Link href={`/employer/fairs/${p.drive.id}`} className="block">
        <Card className="p-4 hover:border-emce-mid hover:shadow-emce-hover">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-bold text-emce-text">{p.drive.title}</span>
                <StatusBadge status={p.status} driveStatus={p.drive.status} />
                {p.boothLabel && (
                  <Badge variant="default" size="sm">
                    {p.boothLabel}
                  </Badge>
                )}
              </div>
              <p className="text-hint text-emce-text-sec">
                📍 {p.drive.city} ·{" "}
                {p.drive.startsAt.toLocaleDateString("en-IN", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}{" "}
                · {p._count.driveJobs}{" "}
                {p._count.driveJobs === 1 ? "role attached" : "roles attached"}
              </p>
            </div>
            <span className="text-hint text-emce-dark">Manage →</span>
          </div>
        </Card>
      </Link>
    </li>
  );
}

function StatusBadge({ status, driveStatus }: { status: string; driveStatus: string }) {
  if (status === "INVITED") return <Badge variant="warning" size="sm">Invitation pending</Badge>;
  if (status === "WITHDRAWN") return <Badge variant="outline" size="sm">Declined</Badge>;
  if (driveStatus === "IN_PROGRESS") return <Badge variant="success" size="sm">Live now</Badge>;
  if (driveStatus === "CLOSED") return <Badge variant="outline" size="sm">Closed</Badge>;
  return <Badge variant="default" size="sm">Confirmed</Badge>;
}
