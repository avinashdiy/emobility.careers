import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmployerShell } from "@/components/layout/employer-shell";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { recruiterApproveExperience, recruiterRejectExperience } from "@/server/experience-verify/actions";
import { formatMonthYear } from "@/lib/utils";

export const metadata = { title: "Verify ex-employees" };

/**
 * Recruiter approval queue. Lists every Experience row claiming a role
 * at the recruiter's company that isn't yet verified, plus the candidate
 * card. One-click approve stamps the row as VERIFIED via
 * RECRUITER_APPROVAL; reject leaves it untouched (the candidate can
 * still earn the badge via the email-domain path) but logs the action.
 *
 * Only visible to ADMIN + employer-team-members. The query scopes to
 * the recruiter's company so a recruiter at Ola can never approve a
 * claim at Ather, even if they sneak the experienceId.
 */
export default async function EmployerVerificationsPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "EMPLOYER" && session.user.role !== "ADMIN") redirect("/403");

  const employer = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
    include: { company: { select: { id: true, name: true, slug: true, logoUrl: true } } },
  });
  if (!employer) redirect("/employer/onboarding");

  // Pending = experiences at this company without a verifiedAt stamp.
  // Already-stamped rows are surfaced in a small "recent" tab below
  // so the recruiter sees their own approvals' impact.
  const [pending, recent] = await Promise.all([
    db.experience.findMany({
      where: { companyId: employer.companyId, verifiedAt: null },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        candidate: {
          select: {
            slug: true,
            firstName: true,
            lastName: true,
            headline: true,
            profilePhotoUrl: true,
            isDIYguruVerified: true,
          },
        },
      },
    }),
    db.experience.findMany({
      where: { companyId: employer.companyId, verifiedAt: { not: null } },
      orderBy: { verifiedAt: "desc" },
      take: 10,
      include: {
        candidate: {
          select: {
            slug: true,
            firstName: true,
            lastName: true,
            headline: true,
            profilePhotoUrl: true,
          },
        },
      },
    }),
  ]);

  return (
    <EmployerShell>
      <div className="container max-w-4xl space-y-6 py-10">
        <PageHeader
          eyebrow="Trust"
          title="Verify ex-employees"
          subtitle={
            <>
              Approve candidates who claim a role at <strong className="text-emce-text">{employer.company.name}</strong>. They'll show a ✓ Verified badge on their profile and rank higher in recruiter search.
            </>
          }
        />

        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-section text-emce-text">Pending claims</h2>
            <Badge variant="outline">{pending.length}</Badge>
          </div>
          {pending.length === 0 ? (
            <div className="mt-3">
              <EmptyState
                icon="✓"
                title="No pending claims"
                body="When candidates link their experience to your company, they show up here for one-click approval."
              />
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-emce-border">
              {pending.map((e) => {
                const fullName = [e.candidate.firstName, e.candidate.lastName].filter(Boolean).join(" ");
                return (
                  <li key={e.id} className="flex items-center gap-3 py-3">
                    <Avatar src={e.candidate.profilePhotoUrl} name={fullName} size="md" />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/${e.candidate.slug}`}
                        className="block font-bold text-emce-text hover:underline"
                      >
                        {fullName}
                        {e.candidate.isDIYguruVerified && (
                          <Badge variant="verified" className="ml-1.5 text-[10px]">⭐</Badge>
                        )}
                      </Link>
                      <p className="line-clamp-1 text-hint text-emce-text-sec">
                        Claims: <strong>{e.title}</strong> at {employer.company.name}
                      </p>
                      <p className="text-hint text-emce-text-muted">
                        {formatMonthYear(e.startDate)} – {e.current ? "Present" : formatMonthYear(e.endDate)}
                      </p>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      <form action={recruiterApproveExperience}>
                        <input type="hidden" name="experienceId" value={e.id} />
                        <Button type="submit" size="sm">✓ Approve</Button>
                      </form>
                      <form action={recruiterRejectExperience}>
                        <input type="hidden" name="experienceId" value={e.id} />
                        <Button type="submit" size="sm" variant="ghost">Reject</Button>
                      </form>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {recent.length > 0 && (
          <Card>
            <h2 className="text-section text-emce-text">Recently verified</h2>
            <ul className="mt-3 divide-y divide-emce-border">
              {recent.map((e) => {
                const fullName = [e.candidate.firstName, e.candidate.lastName].filter(Boolean).join(" ");
                return (
                  <li key={e.id} className="flex items-center gap-3 py-2.5">
                    <Avatar src={e.candidate.profilePhotoUrl} name={fullName} size="sm" />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/${e.candidate.slug}`}
                        className="block truncate text-sm font-bold text-emce-text hover:underline"
                      >
                        {fullName}
                      </Link>
                      <p className="truncate text-hint text-emce-text-sec">
                        ✓ Verified · {e.title} ·{" "}
                        {e.verifiedMethod === "EMAIL_DOMAIN"
                          ? "via work email"
                          : e.verifiedMethod === "RECRUITER_APPROVAL"
                          ? "via recruiter"
                          : "via admin"}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </div>
    </EmployerShell>
  );
}
