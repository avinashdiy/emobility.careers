import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { CreateCompanyForm } from "@/components/employer/CreateCompanyForm";
import { CompanySearchOnboarding } from "@/components/employer/CompanySearchOnboarding";

export const metadata = { title: "Set up your company" };

/**
 * Employer onboarding — two-step flow.
 *
 *   /employer/onboarding              → search-or-create chooser
 *   /employer/onboarding?create=1     → create-new-company form
 *   /employer/onboarding?create=1&name=X → same form, name pre-filled
 *
 * The search step lives in <CompanySearchOnboarding> (client). When a
 * match is picked + designation supplied, it posts to
 * `joinExistingCompany` and links the recruiter to the existing
 * Company. When the user can't find their company, we route to
 * ?create=1 which renders the existing create form (this page) with
 * an optional pre-filled name.
 */
export default async function EmployerOnboarding({
  searchParams,
}: {
  searchParams: Promise<{ create?: string; name?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/signin?next=/employer/onboarding");
  // Both EMPLOYERs and CANDIDATEs can land here — candidates clicking
  // "Hire on eMobility" from their dropdown end up on this page to opt
  // into the second persona. Only block ADMINs from accidental misuse
  // (they don't get an EmployerProfile through this route).
  if (
    session.user.role !== "EMPLOYER" &&
    session.user.role !== "CANDIDATE" &&
    session.user.role !== "ADMIN"
  ) {
    redirect("/403");
  }
  const existing = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (existing) redirect("/employer");

  const sp = await searchParams;
  const wantsCreate = sp.create === "1";

  return (
    <div className="min-h-screen bg-emce-light-bg">
      <main className="container max-w-2xl py-12">
        <header className="mb-6">
          <h1 className="text-2xl font-extrabold text-emce-text md:text-3xl">
            Set up your hiring presence
          </h1>
          <p className="mt-1 text-sm text-emce-text-sec">
            {wantsCreate
              ? "Create your company page. It will be reviewed before your first job goes live."
              : "Find your company on eMobility Careers. If it's not here yet, you can create the page in the next step."}
          </p>
        </header>

        {wantsCreate ? (
          <Card className="p-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-extrabold text-emce-text">Create company page</h2>
              <Link
                href="/employer/onboarding"
                className="text-xs font-bold text-emce-dark hover:underline"
              >
                ← Back to search
              </Link>
            </div>
            <CreateCompanyForm initialName={sp.name ?? ""} />
          </Card>
        ) : (
          <CompanySearchOnboarding />
        )}
      </main>
    </div>
  );
}
