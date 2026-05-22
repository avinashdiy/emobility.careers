import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { AdminShell } from "@/components/layout/admin-shell";
import { PageHeader } from "@/components/ui/page-header";
import { BulkReclassifyForm } from "@/components/admin/BulkReclassifyForm";

export const metadata: Metadata = { title: "Bulk reclassify · Admin" };
export const dynamic = "force-dynamic";

/**
 * Bulk-CSV reclassification surface (PR 9).
 *
 * Companion to `/admin/companies` (PR 7) — the per-row form
 * there handles the steady-state trickle of "Tata acquired X,
 * flip X's hqCountry". This page handles the launch-event
 * batch: "we're opening UK; here are 200 anchor employers we
 * want tagged GB or GB+IN in one paste".
 *
 * Validation + write semantics live in `adminBulkReclassifyCompanies`
 * (server/admin/actions.ts):
 *   • Whole batch wraps in ONE transaction — partial failures
 *     roll back so the DB never lands mid-import.
 *   • Per-row validation errors don't kill the batch — they
 *     surface in the result table for the admin to review +
 *     re-upload with fixes.
 *   • Sweeping revalidatePath across every supported country's
 *     `/[cc]/companies` route since a batch touch likely
 *     spans many countries.
 */
export default async function AdminCompaniesBulkPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");

  return (
    <AdminShell>
      <div className="container max-w-3xl py-8 md:py-10">
        <nav className="mb-2 text-hint text-emce-text-sec">
          <Link href="/admin/companies" className="hover:underline">
            ← Back to per-row reclassification
          </Link>
        </nav>
        <PageHeader
          eyebrow="Admin · Companies"
          title="Bulk reclassify"
          subtitle="Upload a CSV of (slug, hqCountry, operatesIn) to reclassify many companies at once. Useful when onboarding a new market — paste 200 anchor employers, get them all tagged in 30 seconds."
        />
        <div className="mt-6">
          <BulkReclassifyForm />
        </div>
      </div>
    </AdminShell>
  );
}
