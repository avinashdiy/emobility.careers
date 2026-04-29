import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { EmployerShell } from "@/components/layout/employer-shell";
import { CompetitionDraftForm } from "@/components/competitions/CompetitionDraftForm";

export const metadata = { title: "New competition" };

export default async function NewCompetitionPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin?next=/employer/competitions/new");
  if (session.user.role !== "EMPLOYER" && session.user.role !== "ADMIN") redirect("/403");

  const employer = await db.employerProfile.findUnique({ where: { userId: session.user.id } });
  if (!employer) redirect("/employer/onboarding");

  const evDomains = await db.eVDomain.findMany({ orderBy: { order: "asc" } });

  return (
    <EmployerShell>
      <div className="container max-w-3xl space-y-4 py-6">
        <div>
          <h1 className="text-dashboard text-emce-text md:text-3xl">Draft a new competition</h1>
          <p className="mt-1 text-sm text-emce-text-sec">
            Save a draft, then add stages and prizes before submitting for admin review.
          </p>
        </div>
        <CompetitionDraftForm hostCompanyId={employer.companyId} evDomains={evDomains} />
      </div>
    </EmployerShell>
  );
}
