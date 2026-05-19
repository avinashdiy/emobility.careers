import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { EmployerShell } from "@/components/layout/employer-shell";
import { ToastFromSearchParams } from "@/components/ui/toast-from-params";
import { lookupCandidateByCode } from "@/server/recruitment-drives/booth-actions";

export const metadata = { title: "Booth scanner" };
export const dynamic = "force-dynamic";

/**
 * Booth-day scanner for employer recruiters. Two ways to look up a
 * candidate at the booth:
 *
 *   1. Type / paste the 6-char check-in code (the candidate reads it
 *      off their phone or hands you their printed pass). Works on
 *      any device, no camera permission.
 *   2. (Future) Use the device camera + BarcodeDetector API to scan
 *      the QR. Implemented as a v2 enhancement — same target URL.
 *
 * On submit → redirects to the candidate's public profile with
 * `?fairCtx=<driveId>` so the profile view can render fair-day CTAs
 * (Shortlist for our open role, Add to ATS, etc).
 *
 * Gated by EmployerShell + the booth-confirmation check in
 * lookupCandidateByCode — recruiters from non-participating
 * companies can't reach the lookup even if they brute-force codes.
 */
export default async function BoothScannerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "EMPLOYER" && session.user.role !== "ADMIN") {
    redirect("/403");
  }
  const { id } = await params;

  const drive = await db.recruitmentDrive.findUnique({
    where: { id },
    select: { id: true, slug: true, title: true, city: true, state: true, status: true },
  });
  if (!drive) notFound();

  // Verify employer has a participating company at this drive.
  let boothLabel: string | null = null;
  let companyName = "";
  if (session.user.role !== "ADMIN") {
    const employer = await db.employerProfile.findUnique({
      where: { userId: session.user.id },
      select: {
        companyId: true,
        company: { select: { name: true } },
      },
    });
    if (!employer) redirect("/employer/onboarding");
    const participation = await db.recruitmentDriveCompany.findUnique({
      where: { driveId_companyId: { driveId: id, companyId: employer.companyId } },
      select: { status: true, boothLabel: true },
    });
    if (!participation) {
      redirect(`/employer/fairs?error=${encodeURIComponent("Your company isn't registered for this fair.")}`);
    }
    if (participation.status !== "CONFIRMED") {
      redirect(`/employer/fairs/${id}?error=${encodeURIComponent("Confirm your booth before scanning.")}`);
    }
    boothLabel = participation.boothLabel ?? null;
    companyName = employer.company.name;
  }

  return (
    <EmployerShell>
      <div className="container max-w-2xl py-8">
        <ToastFromSearchParams />
        <Link href={`/employer/fairs/${drive.id}`} className="text-xs font-bold text-emce-dark hover:underline">
          ← Booth overview
        </Link>
        <h1 className="mt-1 text-dashboard text-emce-text">Booth scanner</h1>
        <p className="mt-1 text-hint text-emce-text-sec">
          {drive.title} · {[drive.city, drive.state].filter(Boolean).join(", ")}
          {companyName && ` · ${companyName}`}
          {boothLabel && ` · ${boothLabel}`}
        </p>

        <Card className="mt-6 p-6">
          <form action={lookupCandidateByCode} className="space-y-4">
            <input type="hidden" name="driveId" value={drive.id} />
            <div>
              <Label htmlFor="code">Check-in code</Label>
              <Input
                id="code"
                name="code"
                required
                minLength={6}
                maxLength={20}
                placeholder="ABCD23"
                autoComplete="off"
                autoCapitalize="characters"
                autoFocus
                className="font-mono text-lg tracking-[0.3em] uppercase"
                inputMode="text"
              />
              <p className="mt-1 text-hint text-emce-text-muted">
                Type the 6-character code the candidate has on their fair pass.
                Case-insensitive.
              </p>
            </div>
            <SubmitButton className="w-full" size="lg" pendingLabel="Looking up…">
              🔍 Open candidate profile
            </SubmitButton>
          </form>
        </Card>

        <Card className="mt-4 p-4">
          <p className="text-section text-emce-text">Tips</p>
          <ul className="mt-2 space-y-1 text-sm text-emce-text-sec">
            <li>• Codes are 6 characters — letters A-Z (no I, O) and digits 2-9.</li>
            <li>• If the candidate&apos;s phone is dead, ask the check-in desk to look up their code by email.</li>
            <li>• Want to shortlist them after meeting? Open their profile → click <strong>☆ Save</strong>.</li>
            <li>• To pre-screen who&apos;s coming: <Link href={`/employer/fairs/${drive.id}/candidates`} className="font-bold text-emce-dark hover:underline">view all registered candidates →</Link></li>
          </ul>
        </Card>
      </div>
    </EmployerShell>
  );
}
