import { redirect } from "next/navigation";
import { signinNextUrl } from "@/lib/auth-redirect";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { EmployerShell } from "@/components/layout/employer-shell";
import { EmployerJobForm } from "@/components/employer/EmployerJobForm";

export const metadata = { title: "Post a job" };

/**
 * Recruiter-facing "Post a new job" page. Server-component shell —
 * fetches the EV domain taxonomy, then hands off to the
 * client-rendered EmployerJobForm. The form uses useActionState so a
 * validation failure preserves all typed input + surfaces per-field
 * errors (instead of the old `?error=...` redirect that wiped data).
 */
export default async function NewJobPage() {
  const session = await auth();
  if (!session?.user) redirect(await signinNextUrl());
  const employer = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
    // Pull the company's HQ country so the job form's country
    // dropdown pre-fills to it. Recruiter can override per job
    // when posting cross-market roles.
    include: { company: { select: { hqCountry: true } } },
  });
  if (!employer) redirect("/employer/onboarding");

  const evDomains = await db.eVDomain.findMany({
    orderBy: { order: "asc" },
    select: { id: true, slug: true, name: true },
  });

  return (
    <EmployerShell>
      <div className="container max-w-3xl py-10">
        <div className="flex items-end justify-between animate-fade-up">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emce-mid-muted">
              📝 New role
            </p>
            <h1 className="mt-1 text-2xl font-extrabold leading-tight tracking-tight text-emce-text md:text-[28px]">
              Post a <span className="emce-text-gradient">new job</span>
            </h1>
            <p className="mt-1 text-sm text-emce-text-sec">
              Fill in the basics — or paste rough notes and let AI structure them into a polished JD.
            </p>
          </div>
        </div>

        <Card className="mt-6 p-6">
          <EmployerJobForm
            evDomains={evDomains}
            defaultCountry={employer.company.hqCountry}
          />
        </Card>
      </div>
    </EmployerShell>
  );
}
