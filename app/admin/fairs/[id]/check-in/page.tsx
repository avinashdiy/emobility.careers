import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { AdminShell } from "@/components/layout/admin-shell";
import { ToastFromSearchParams } from "@/components/ui/toast-from-params";
import { Avatar } from "@/components/ui/avatar";
import { checkInRegistration } from "@/server/recruitment-drives/registrations";
import { relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Fair check-in · admin" };
export const dynamic = "force-dynamic";

/**
 * #3 On-site check-in scanner — admin/fair-staff surface.
 *
 * Two ways to mark a candidate present:
 *
 *   1. Type / paste the 6-character check-in code into the form
 *      at the top → click Check in. Works hands-free if the
 *      candidate reads the code off their phone.
 *   2. Use the list below — every registered candidate has a
 *      "Mark in" button pre-filled with their code. Useful when
 *      a candidate forgot to bring their pass (fair staff looks
 *      them up by name, clicks the button).
 *
 * The list is filtered to REGISTERED-status rows by default
 * (the work-queue view). Checked-in + cancelled rows hide so
 * staff can focus on who still needs to be processed.
 *
 * v1 deliberately omits a camera-based QR scanner — adding one
 * needs a client component + a permissions flow + a fall-through
 * for browsers without camera APIs. The 6-char manual entry
 * solves the same problem with zero device prerequisites and
 * works for venue staff handed a borrowed laptop.
 */
export default async function FairCheckInPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ show?: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");

  const { id } = await params;
  const sp = await searchParams;
  const showFilter: "queue" | "all" = sp.show === "all" ? "all" : "queue";

  const drive = await db.recruitmentDrive.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      startsAt: true,
      registeredCount: true,
      checkedInCount: true,
    },
  });
  if (!drive) notFound();

  const registrations = await db.recruitmentDriveRegistration.findMany({
    where: {
      driveId: drive.id,
      ...(showFilter === "queue" ? { status: "REGISTERED" } : {}),
    },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    take: 500,
    select: {
      id: true,
      status: true,
      checkInCode: true,
      createdAt: true,
      checkedInAt: true,
      candidate: {
        select: {
          firstName: true,
          lastName: true,
          slug: true,
          profilePhotoUrl: true,
          headline: true,
          city: true,
        },
      },
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
            Check-in · {drive.title}
          </h1>
          <p className="mt-1 text-hint text-emce-text-sec">
            {drive.checkedInCount} / {drive.registeredCount} attendees checked in.
          </p>
        </div>

        {/* Code entry — primary input */}
        <Card className="p-5">
          <form
            action={checkInRegistration}
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <input type="hidden" name="driveId" value={drive.id} />
            <div className="flex-1">
              <Label htmlFor="check-in-code">Check-in code</Label>
              <Input
                id="check-in-code"
                name="code"
                placeholder="6-character code (e.g. K3F9PQ)"
                maxLength={20}
                autoFocus
                autoComplete="off"
                className="font-mono text-base tracking-[0.2em]"
              />
              <p className="mt-1 text-hint text-emce-text-muted">
                Ask the candidate to read the code off their fair pass.
                We auto-uppercase, so typing case doesn&apos;t matter.
              </p>
            </div>
            <SubmitButton size="lg" pendingLabel="Checking in…">
              Check in →
            </SubmitButton>
          </form>
        </Card>

        {/* Roster */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-section text-emce-text">
              {showFilter === "queue" ? "Awaiting check-in" : "All registrations"}
            </h2>
            <div className="flex gap-1 rounded-md border border-emce-border p-1">
              <Link
                href={`/admin/fairs/${drive.id}/check-in`}
                className={`rounded px-3 py-1 text-xs font-semibold ${showFilter === "queue" ? "bg-emce-light-soft text-emce-darkest" : "text-emce-text-sec hover:text-emce-text"}`}
              >
                Queue
              </Link>
              <Link
                href={`/admin/fairs/${drive.id}/check-in?show=all`}
                className={`rounded px-3 py-1 text-xs font-semibold ${showFilter === "all" ? "bg-emce-light-soft text-emce-darkest" : "text-emce-text-sec hover:text-emce-text"}`}
              >
                All
              </Link>
            </div>
          </div>

          {registrations.length === 0 ? (
            <p className="mt-4 text-hint text-emce-text-sec">
              {showFilter === "queue"
                ? "Everyone's checked in or no one's registered yet."
                : "No registrations yet."}
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-emce-border rounded-md border border-emce-border bg-white">
              {registrations.map((r) => {
                const fullName = `${r.candidate.firstName} ${r.candidate.lastName ?? ""}`.trim();
                return (
                  <li key={r.id} className="flex items-center gap-3 p-3">
                    <Avatar
                      src={r.candidate.profilePhotoUrl}
                      name={fullName}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/${r.candidate.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="truncate font-bold text-emce-text hover:underline"
                        >
                          {fullName}
                        </Link>
                        {r.status === "CHECKED_IN" && (
                          <Badge variant="success" size="sm">✓ In</Badge>
                        )}
                        {r.status === "CANCELLED" && (
                          <Badge variant="danger" size="sm">Cancelled</Badge>
                        )}
                      </div>
                      {r.candidate.headline && (
                        <p className="truncate text-hint text-emce-text-sec">
                          {r.candidate.headline}
                        </p>
                      )}
                      <p className="text-[10px] tabular-nums text-emce-text-muted">
                        Code: <span className="font-mono font-bold">{r.checkInCode}</span>
                        {" · "}
                        {r.status === "CHECKED_IN" && r.checkedInAt
                          ? `Checked in ${relativeTime(r.checkedInAt)}`
                          : `Registered ${relativeTime(r.createdAt)}`}
                      </p>
                    </div>
                    {r.status === "REGISTERED" && (
                      <form action={checkInRegistration}>
                        <input type="hidden" name="driveId" value={drive.id} />
                        <input type="hidden" name="code" value={r.checkInCode} />
                        <SubmitButton variant="outline" size="sm" pendingLabel="…">
                          Mark in
                        </SubmitButton>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {registrations.length === 500 && (
            <p className="mt-3 text-hint text-emce-text-muted">
              Showing the first 500 — narrow with the code search above.
            </p>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
