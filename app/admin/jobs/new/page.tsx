import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { AdminShell } from "@/components/layout/admin-shell";
import { AdminJobForm } from "@/components/admin/AdminJobForm";

export const metadata = { title: "Admin · Post a job" };

/**
 * Admin job-posting page. Server-component shell — fetches the
 * company directory + EV domain taxonomy, then hands off to the
 * client-rendered AdminJobForm which handles validation + per-
 * field errors via useActionState (no more "redirect on failure
 * loses every field" pattern).
 */
export default async function AdminNewJobPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");

  const [companies, evDomains] = await Promise.all([
    db.company.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
    }),
    db.eVDomain.findMany({
      orderBy: { order: "asc" },
      select: { id: true, slug: true, name: true },
    }),
  ]);

  return (
    <AdminShell>
      <div className="container max-w-3xl py-10">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-dashboard text-emce-text">Post a job (admin)</h1>
            <p className="mt-1 text-sm text-emce-text-sec">
              Post on behalf of an existing company, or create one inline. For
              external listings (e.g. aggregated from a career site) set the
              <em> Apply URL</em> so the public CTA links straight out.
            </p>
          </div>
          <Link href="/admin/jobs" className="shrink-0 text-sm font-bold text-emce-dark hover:underline">
            ← Back to job moderation
          </Link>
        </div>

        <Card className="p-6">
          <AdminJobForm companies={companies} evDomains={evDomains} />
        </Card>
      </div>
    </AdminShell>
  );
}
