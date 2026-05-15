import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AdminShell } from "@/components/layout/admin-shell";
import { importDIYguruRoster, manuallyVerifyCandidate } from "@/server/admin/actions";

export const metadata = { title: "DIYguru roster" };

export default async function DIYguruAdmin({
  searchParams,
}: {
  searchParams: Promise<{ imported?: string; matched?: string; error?: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const sp = await searchParams;

  const batches = await db.dIYguruImportBatch.findMany({
    orderBy: { importedAt: "desc" },
    take: 10,
    include: { uploadedBy: { select: { name: true, email: true } } },
  });

  const candidates = await db.candidateProfile.findMany({
    where: {
      OR: [
        { isDIYguruVerified: true },
        { labExposureTags: { has: "diyguru-mentioned" } },
      ],
    },
    take: 50,
    orderBy: { updatedAt: "desc" },
    include: { user: { select: { email: true } } },
  });

  return (
    <AdminShell>
      <div className="container max-w-5xl py-10">
        <h1 className="text-dashboard text-emce-text">DIYguru roster</h1>
        <p className="mt-1 text-sm text-emce-text-sec">
          Upload a CSV of enrolled / graduated students. Matching emails get auto-verified on the platform.
        </p>

        {sp.imported && (
          <div className="mt-4 rounded-md bg-emce-light-soft p-3 text-sm text-emce-dark">
            ✓ Imported {sp.imported} rows · matched {sp.matched ?? 0} candidates.
          </div>
        )}
        {sp.error && (
          <div className="mt-4 rounded-md bg-emce-red-light p-3 text-sm text-emce-red-deep">{sp.error}</div>
        )}

        <Card className="mt-6 p-6">
          <h2 className="text-section text-emce-text">Upload CSV</h2>
          <p className="mt-1 text-hint text-emce-text-sec">
            Headers (case-insensitive): <code>email, full_name, student_id, phone, course_name, course_slug, completion_date, grade, lab_tags, capstone_title</code>.
            Multiple lab_tags separated by <code>|</code>.
          </p>
          <form action={importDIYguruRoster} className="mt-4 space-y-3" encType="multipart/form-data">
            <div>
              <Label htmlFor="file">CSV file</Label>
              <Input id="file" name="file" type="file" accept=".csv,text/csv" required />
            </div>
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" name="notes" rows={2} placeholder="Cohort name, source, etc." />
            </div>
            <div className="flex justify-end">
              <Button type="submit">Import roster</Button>
            </div>
          </form>
        </Card>

        <Card className="mt-6 p-6">
          <h2 className="text-section text-emce-text">Recent import batches</h2>
          {batches.length === 0 ? (
            <p className="mt-2 text-hint text-emce-text-sec">No imports yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {batches.map((b) => (
                <li key={b.id} className="flex items-start justify-between rounded-md border border-emce-border p-3">
                  <div>
                    <div className="font-bold text-emce-text">{b.rowCount} rows · {b.matchedCount} matched</div>
                    <div className="text-hint text-emce-text-muted">
                      {b.uploadedBy.name ?? b.uploadedBy.email} · {b.importedAt.toLocaleString()}
                    </div>
                    {b.notes && <p className="text-hint text-emce-text-sec">{b.notes}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="mt-6 p-6">
          <h2 className="text-section text-emce-text">Verified / mentioned candidates</h2>
          <ul className="mt-4 space-y-2">
            {candidates.map((c) => (
              <li key={c.id} className="flex items-start justify-between rounded-md border border-emce-border p-3">
                <div>
                  <div className="flex items-center gap-2 font-bold text-emce-text">
                    {c.firstName} {c.lastName ?? ""}
                    {c.isDIYguruVerified ? (
                      <Badge variant="verified">⭐ Verified</Badge>
                    ) : (
                      <Badge variant="warning">Mentioned</Badge>
                    )}
                  </div>
                  <div className="text-hint text-emce-text-sec">{c.user.email}</div>
                  {c.diyguruStudentId && (
                    <div className="text-hint text-emce-text-muted">Student #{c.diyguruStudentId}</div>
                  )}
                </div>
                <form action={manuallyVerifyCandidate}>
                  <input type="hidden" name="candidateId" value={c.id} />
                  <input type="hidden" name="verified" value={c.isDIYguruVerified ? "false" : "true"} />
                  <Button type="submit" size="sm" variant={c.isDIYguruVerified ? "outline" : "default"}>
                    {c.isDIYguruVerified ? "Un-verify" : "Verify"}
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </AdminShell>
  );
}
