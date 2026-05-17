import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/ui/submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { ToastFromSearchParams } from "@/components/ui/toast-from-params";
import { importDIYguruRoster } from "@/server/admin/actions";
import { relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Import students · TPO" };
export const dynamic = "force-dynamic";

/**
 * TPO-facing CSV roster import. Mirrors the admin tool at
 * /admin/diyguru but with two key differences:
 *   • Auth gate is `isPlacementOfficer = true OR ADMIN` (enforced
 *     by the parent TPO layout AND by the server action's
 *     `requireAdminOrTpo`).
 *   • Posts `returnTo=/tpo/import` so success/error redirects stay
 *     in the TPO console.
 *
 * Trust split: a TPO running this import populates the roster
 * table + their cohort assignments, but DOES NOT grant the
 * DIYguru-verified badge to matching candidates — that brand
 * signal remains an admin-only flip. See importDIYguruRoster
 * server action for the gating.
 */
export default async function TpoImportPage({
  searchParams,
}: {
  searchParams: Promise<{ imported?: string; matched?: string; error?: string }>;
}) {
  const session = await auth();
  // Belt-and-braces — the layout also gates this, but a direct
  // server-action call would bypass the layout.
  if (!session?.user) redirect("/signin?next=/tpo/import");
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, isPlacementOfficer: true },
  });
  if (!user) redirect("/signin");
  if (user.role !== "ADMIN" && !user.isPlacementOfficer) redirect("/403");

  const sp = await searchParams;

  // Show this TPO's own recent imports so they can verify what
  // landed. Admins see only their own here too (the full audit
  // lives at /admin/diyguru).
  const myBatches = await db.dIYguruImportBatch.findMany({
    where: { uploadedById: session.user.id },
    orderBy: { importedAt: "desc" },
    take: 10,
    select: {
      id: true,
      rowCount: true,
      matchedCount: true,
      notes: true,
      importedAt: true,
    },
  });

  return (
    <div className="space-y-6">
      <ToastFromSearchParams />
      <PageHeader
        eyebrow="Roster import"
        title="Import students"
        subtitle="Upload your cohort CSV — students who already have accounts will be auto-tagged to your placement funnel."
        backHref="/tpo"
      />

      {sp.imported && (
        <div className="rounded-md bg-emce-light-soft p-3 text-sm text-emce-dark">
          ✓ Imported {sp.imported} rows · matched {sp.matched ?? 0} candidates already on the platform.
        </div>
      )}
      {sp.error && (
        <div className="rounded-md bg-emce-red-light p-3 text-sm text-emce-red-deep">
          {sp.error}
        </div>
      )}

      <Card className="p-6">
        <h2 className="text-section text-emce-text">Upload CSV</h2>
        <p className="mt-1 text-hint text-emce-text-sec">
          Headers (case-insensitive):{" "}
          <code className="rounded bg-emce-light-soft px-1 text-[11px]">
            email, full_name, student_id, phone, course_name, course_slug, completion_date, grade, lab_tags, capstone_title
          </code>
          . Multiple <code>lab_tags</code> separated by <code>|</code>. Max
          10 MB / 10,000 rows per upload.
        </p>

        <form
          action={importDIYguruRoster}
          className="mt-4 space-y-3"
          encType="multipart/form-data"
        >
          <input type="hidden" name="returnTo" value="/tpo/import" />
          <div>
            <Label htmlFor="file">CSV file *</Label>
            <Input id="file" name="file" type="file" accept=".csv,text/csv" required />
          </div>
          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              rows={2}
              placeholder="E.g. 'B.Tech EEE 2026 batch — Bharat eMobility Pune fair attendees'"
              maxLength={500}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-emce-border pt-3">
            <p className="text-hint text-emce-text-muted">
              After importing, head to{" "}
              <Link href="/tpo/cohorts" className="font-bold text-emce-dark hover:underline">
                Cohorts
              </Link>{" "}
              to bind these rows to a cohort.
            </p>
            <SubmitButton pendingLabel="Uploading…">
              Import roster
            </SubmitButton>
          </div>
        </form>
      </Card>

      {/* Recent imports table */}
      <div>
        <h2 className="text-section text-emce-text">Your recent imports</h2>
        {myBatches.length === 0 ? (
          <p className="mt-2 text-hint text-emce-text-sec">
            No imports yet. Upload your first cohort above.
          </p>
        ) : (
          <Card className="mt-3 overflow-hidden p-0">
            <table className="min-w-full divide-y divide-emce-border text-sm">
              <thead className="bg-emce-light-soft">
                <tr>
                  <th className="px-4 py-2 text-left font-bold text-emce-text">When</th>
                  <th className="px-4 py-2 text-right font-bold text-emce-text">Rows</th>
                  <th className="px-4 py-2 text-right font-bold text-emce-text">Matched</th>
                  <th className="px-4 py-2 text-left font-bold text-emce-text">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emce-border">
                {myBatches.map((b) => (
                  <tr key={b.id}>
                    <td className="px-4 py-2 text-emce-text-sec">
                      {relativeTime(b.importedAt)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {b.rowCount.toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {b.matchedCount.toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-2 text-emce-text-sec">
                      {b.notes ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  );
}
