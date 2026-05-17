import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AdminShell } from "@/components/layout/admin-shell";
import { ToastFromSearchParams } from "@/components/ui/toast-from-params";
import { RosterUploadForm } from "@/components/recruitment-drives/RosterUploadForm";
import { relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Fair roster import · admin" };
export const dynamic = "force-dynamic";

/**
 * #5 Bulk attendee roster — admin uploads a college / employer
 * roster CSV that auto-registers everyone with an account, and
 * reports back which rows need a manual signup invite.
 *
 * Mirrors the existing DIYguru-roster pattern (lib/diyguru.ts) but
 * scoped per-fair so a college sending a placement-cell roster for
 * one specific drive doesn't bleed into the general DIYguru
 * student pool.
 *
 * Expected CSV shape — column names are flexible (we accept
 * `email`/`Email`/`E-mail` and `name`/`fullName`/`Name`):
 *
 *     email,fullName
 *     anita@iit-roorkee.ac.in,Anita Verma
 *     rohit@vit.ac.in,Rohit Kumar
 *
 * The action records an audit row per upload + a counter summary
 * (rowCount / registeredCount / failedCount / errorReport JSON).
 * Failed rows are typically "no candidate account yet" — the admin
 * needs to send those candidates an email to sign up first.
 */
export default async function FairRosterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");

  const { id } = await params;

  const drive = await db.recruitmentDrive.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      title: true,
      registeredCount: true,
      checkedInCount: true,
    },
  });
  if (!drive) notFound();

  const imports = await db.recruitmentDriveRosterImport.findMany({
    where: { driveId: drive.id },
    orderBy: { uploadedAt: "desc" },
    take: 20,
    select: {
      id: true,
      fileName: true,
      rowCount: true,
      invitedCount: true,
      registeredCount: true,
      failedCount: true,
      errorReport: true,
      uploadedAt: true,
      completedAt: true,
      uploadedBy: { select: { name: true, email: true } },
    },
  });

  return (
    <AdminShell>
      <div className="container max-w-4xl space-y-6 py-6 md:py-8">
        <ToastFromSearchParams />
        <div>
          <Link
            href={`/admin/fairs/${drive.id}`}
            className="text-hint font-bold text-emce-text-sec hover:text-emce-dark"
          >
            ← Back to fair
          </Link>
          <h1 className="mt-2 text-dashboard text-emce-text">
            Roster import · {drive.title}
          </h1>
          <p className="mt-1 text-hint text-emce-text-sec">
            Bulk-register a college&apos;s placement cohort or a partner
            organisation&apos;s candidate list. {drive.registeredCount}{" "}
            registered, {drive.checkedInCount} checked in so far.
          </p>
        </div>

        <RosterUploadForm driveId={drive.id} />

        <div>
          <h2 className="text-section text-emce-text">Recent imports</h2>
          {imports.length === 0 ? (
            <p className="mt-3 text-hint text-emce-text-sec">
              No imports yet. Drop your first CSV above.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {imports.map((imp) => {
                const errors = Array.isArray(imp.errorReport)
                  ? (imp.errorReport as Array<{ row: number; email: string; reason: string }>)
                  : [];
                return (
                  <li key={imp.id}>
                    <Card className="p-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-bold text-emce-text">
                          {imp.fileName ?? "Untitled upload"}
                        </p>
                        <p className="text-hint text-emce-text-muted">
                          {imp.uploadedBy?.name ?? imp.uploadedBy?.email} ·{" "}
                          {relativeTime(imp.uploadedAt)}
                        </p>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge variant="default" size="sm">
                          {imp.rowCount} rows
                        </Badge>
                        <Badge variant="success" size="sm">
                          {imp.registeredCount} registered
                        </Badge>
                        {imp.invitedCount > 0 && (
                          <Badge variant="warning" size="sm">
                            {imp.invitedCount} need signup
                          </Badge>
                        )}
                        {imp.failedCount > 0 && (
                          <Badge variant="danger" size="sm">
                            {imp.failedCount} errors
                          </Badge>
                        )}
                      </div>
                      {errors.length > 0 && (
                        <details className="mt-3">
                          <summary className="cursor-pointer text-hint font-bold text-emce-text-sec hover:text-emce-dark">
                            Show error rows ({errors.length})
                          </summary>
                          <ul className="mt-2 space-y-1 text-hint text-emce-text-sec">
                            {errors.slice(0, 20).map((e) => (
                              <li
                                key={`${imp.id}-${e.row}-${e.email}`}
                                className="border-l-2 border-emce-red/40 pl-2"
                              >
                                Row {e.row} · {e.email} —{" "}
                                <em className="text-emce-text-muted">{e.reason}</em>
                              </li>
                            ))}
                          </ul>
                          {errors.length > 20 && (
                            <p className="mt-1 text-hint text-emce-text-muted">
                              (showing first 20 of {errors.length})
                            </p>
                          )}
                        </details>
                      )}
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
