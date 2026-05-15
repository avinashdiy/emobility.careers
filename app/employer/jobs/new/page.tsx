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
  });
  if (!employer) redirect("/employer/onboarding");

  const evDomains = await db.eVDomain.findMany({
    orderBy: { order: "asc" },
    select: { id: true, slug: true, name: true },
  });

  return (
    <EmployerShell>
      <div className="container max-w-3xl py-10">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-dashboard text-emce-text">Post a new job</h1>
            <p className="mt-1 text-sm text-emce-text-sec">
              Fill in the basics — or paste rough notes and let AI structure them into a polished JD.
            </p>
          </div>
        </div>

        <Card className="mt-6 p-6">
          <EmployerJobForm evDomains={evDomains} />
        </Card>
      </div>
    </EmployerShell>
  );
}
