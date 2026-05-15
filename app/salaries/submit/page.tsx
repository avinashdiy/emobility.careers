import Link from "next/link";
import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { SubmitSalaryForm } from "@/components/salaries/SubmitSalaryForm";

export const metadata: Metadata = {
  title: "Submit your EV salary anonymously",
};

/**
 * Public salary-submission form. Anonymous by default. Submitting once
 * unlocks the full database for 30 days via cookie. Admin moderation
 * gates whether the submission ever shows publicly.
 *
 * Server-component shell: fetches the EV domain list, then hands off
 * to the client-rendered SubmitSalaryForm (useActionState-driven so
 * rate-limit / quota / schema failures don't wipe the user's typing).
 */
export default async function SalarySubmitPage() {
  const session = await auth();
  const evDomains = await db.eVDomain.findMany({
    orderBy: { order: "asc" },
    select: { id: true, name: true, slug: true },
  });

  return (
    <>
      <SiteHeader />
      <main className="container max-w-2xl space-y-6 py-10">
        <div>
          <Link href="/salaries" className="text-hint font-bold text-emce-dark hover:underline">
            ← Back to Salary Compass
          </Link>
          <h1 className="mt-1 text-2xl font-extrabold text-emce-text md:text-[28px]">
            Submit your EV salary
          </h1>
          <p className="mt-1 text-sm text-emce-text-sec">
            Anonymous by default. Takes 60 seconds. Submitting unlocks the full database for 30 days. Admin-moderated before going live.
          </p>
        </div>

        <Card>
          <SubmitSalaryForm evDomains={evDomains} isSignedIn={!!session?.user} />
        </Card>
      </main>
      <SiteFooter />
    </>
  );
}
