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
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { ToastFromSearchParams } from "@/components/ui/toast-from-params";
import { InstitutionPicker } from "@/components/teams/InstitutionPicker";
import { registerCollegePlacementCell } from "@/server/colleges/actions";

export const metadata: Metadata = {
  title: "Register your college placement cell",
  description:
    "Get your college on emobility.careers — bulk-import students, share JD-matched opportunities, and bring your cohort to our recruitment fairs.",
};
export const dynamic = "force-dynamic";

/**
 * Public-facing TPO sign-up flow. Three paths land here:
 *   • Fresh visitor — sees an explainer + signed-out CTA to /signup
 *     (we keep the form rendered so they understand what they're
 *     signing up for).
 *   • Signed-in user with NO existing application — sees the full
 *     form, can submit.
 *   • Signed-in user WITH an existing application (any status) —
 *     bounced to /me/college which is the status page.
 *
 * The brochure's "400+ Institutional Partners" target hinges on
 * this flow being friction-free: pick (or create) an Institution,
 * fill 4 contact fields, submit. Admin moderation happens at
 * /admin/colleges and unlocks /tpo on approve.
 */
export default async function CollegeRegisterPage() {
  const session = await auth();

  // Already applied → status page handles the lifecycle.
  if (session?.user) {
    const existing = await db.collegePlacementCell.findFirst({
      where: { createdById: session.user.id },
      select: { id: true, status: true },
      orderBy: { createdAt: "desc" },
    });
    if (existing) redirect("/me/college");
  }

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-emce-light-bg py-8 md:py-12">
        <ToastFromSearchParams />
        <div className="container max-w-3xl space-y-6">
          {/* Hero / pitch */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emce-mid-muted">
              For Training & Placement Officers
            </p>
            <h1 className="mt-1 text-3xl font-extrabold leading-tight text-emce-text md:text-4xl">
              Bring your college onto emobility.careers
            </h1>
            <p className="mt-3 text-body text-emce-text-sec">
              The EV industry hires from <strong>150+ partner companies</strong>{" "}
              on our platform. Register your placement cell to import your
              cohort in one CSV, share matched openings with your students,
              and bring them to our Delhi & Pune recruitment fairs.
            </p>
          </div>

          {/* What you get — three-up cards */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emce-mid-muted">
                Step 1
              </p>
              <p className="mt-1 text-section text-emce-text">
                📋 Bulk-import students
              </p>
              <p className="mt-1 text-hint text-emce-text-sec">
                Upload a CSV → profiles auto-created, DIYguru-verified where
                applicable, ready to apply.
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emce-mid-muted">
                Step 2
              </p>
              <p className="mt-1 text-section text-emce-text">
                🎯 Matched openings
              </p>
              <p className="mt-1 text-hint text-emce-text-sec">
                Your dashboard shows openings scored against your students&apos;
                profiles — push relevant ones to specific cohorts.
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emce-mid-muted">
                Step 3
              </p>
              <p className="mt-1 text-section text-emce-text">
                🤝 Recruitment fairs
              </p>
              <p className="mt-1 text-hint text-emce-text-sec">
                Pre-register your cohort for Delhi & Pune fairs — they walk in
                with their fair pass, you see hire counts in real time.
              </p>
            </Card>
          </div>

          {/* Form — gated on signed-in */}
          {!session?.user ? (
            <Card className="p-6 md:p-8">
              <h2 className="text-section text-emce-text">Sign in first</h2>
              <p className="mt-2 text-body text-emce-text-sec">
                You&apos;ll need an emobility.careers account before applying.
                Use your professional email (the one on the college domain works
                best).
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href={`/signin?next=${encodeURIComponent("/colleges/register")}`}
                  className="inline-flex h-10 items-center justify-center rounded-md bg-emce-dark px-5 text-sm font-bold text-white hover:bg-emce-darkest"
                >
                  Sign in
                </Link>
                <Link
                  href={`/signup?next=${encodeURIComponent("/colleges/register")}`}
                  className="inline-flex h-10 items-center justify-center rounded-md border border-emce-border bg-white px-5 text-sm font-bold text-emce-dark hover:bg-emce-light-soft"
                >
                  Create an account
                </Link>
              </div>
            </Card>
          ) : (
            <Card className="p-6 md:p-8">
              <h2 className="text-section text-emce-text">
                Placement cell application
              </h2>
              <p className="mt-1 text-hint text-emce-text-sec">
                Admin reviews applications within 2 business days. We use your
                contact email for the approval notification.
              </p>

              <form
                action={registerCollegePlacementCell}
                className="mt-5 space-y-5"
              >
                {/* ─── Institution picker ─────────────────────── */}
                <div>
                  <InstitutionPicker
                    fieldName="newInstitutionName"
                    idFieldName="institutionId"
                    label="College / Institution *"
                    placeholder="BMS College of Engineering"
                    required
                  />
                  <p className="mt-1 text-hint text-emce-text-muted">
                    Pick from suggestions if your college is listed. If not,
                    just type the full name — we&apos;ll add it as a new entry.
                  </p>
                </div>

                {/* If they typed a new name (no institutionId picked),
                    these create the new Institution row. Hidden when
                    they picked from the dropdown — but cheap to always
                    render, server ignores the new fields when
                    institutionId is set. */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="newInstitutionCity">City</Label>
                    <Input
                      id="newInstitutionCity"
                      name="newInstitutionCity"
                      placeholder="Bengaluru"
                      maxLength={80}
                    />
                  </div>
                  <div>
                    <Label htmlFor="newInstitutionState">State</Label>
                    <Input
                      id="newInstitutionState"
                      name="newInstitutionState"
                      placeholder="Karnataka"
                      maxLength={80}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="newInstitutionWebsite">College website</Label>
                  <Input
                    id="newInstitutionWebsite"
                    name="newInstitutionWebsite"
                    type="url"
                    placeholder="https://bmsce.ac.in"
                    maxLength={500}
                  />
                  <p className="mt-1 text-hint text-emce-text-muted">
                    Helps admin verify quickly. Skip if you picked from the
                    dropdown above.
                  </p>
                </div>

                {/* ─── Contact ─────────────────────────────────── */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="contactName">Your full name *</Label>
                    <Input
                      id="contactName"
                      name="contactName"
                      placeholder="Dr. Rajesh Kumar"
                      required
                      maxLength={120}
                      defaultValue={session.user.name ?? ""}
                    />
                  </div>
                  <div>
                    <Label htmlFor="designation">Designation</Label>
                    <Input
                      id="designation"
                      name="designation"
                      placeholder="TPO Coordinator"
                      maxLength={120}
                    />
                  </div>
                  <div>
                    <Label htmlFor="contactEmail">Work email *</Label>
                    <Input
                      id="contactEmail"
                      name="contactEmail"
                      type="email"
                      placeholder="tpo@bmsce.ac.in"
                      required
                      maxLength={160}
                      defaultValue={session.user.email ?? ""}
                    />
                  </div>
                  <div>
                    <Label htmlFor="contactPhone">Phone</Label>
                    <Input
                      id="contactPhone"
                      name="contactPhone"
                      type="tel"
                      placeholder="+91 98XXXXXX21"
                      maxLength={40}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="studentCount">
                    Cohort size (this academic year)
                  </Label>
                  <Input
                    id="studentCount"
                    name="studentCount"
                    type="number"
                    min={0}
                    max={100000}
                    inputMode="numeric"
                    placeholder="180"
                  />
                  <p className="mt-1 text-hint text-emce-text-muted">
                    Helps admin gauge volume for the import.
                  </p>
                </div>

                <div>
                  <Label htmlFor="notes">
                    Anything else we should know?
                  </Label>
                  <Textarea
                    id="notes"
                    name="notes"
                    rows={4}
                    maxLength={2000}
                    placeholder="E.g. 'We're aligned with the Pune edition — want to import 60 of our B.Tech finals before the fair opens.'"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-emce-border pt-4">
                  <p className="text-hint text-emce-text-muted">
                    By submitting you agree to our{" "}
                    <Link href="/terms" className="font-bold text-emce-dark hover:underline">
                      terms
                    </Link>{" "}
                    and{" "}
                    <Link href="/privacy" className="font-bold text-emce-dark hover:underline">
                      privacy policy
                    </Link>
                    .
                  </p>
                  <SubmitButton pendingLabel="Submitting…">
                    Submit application
                  </SubmitButton>
                </div>
              </form>
            </Card>
          )}

          <p className="text-hint text-emce-text-sec">
            Already a recruiter looking to host a fair? Visit our{" "}
            <Link href="/employer" className="font-bold text-emce-dark hover:underline">
              employer page
            </Link>{" "}
            instead.
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
