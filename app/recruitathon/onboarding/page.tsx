import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { applyRecruitathonResumeReview, saveRecruitathonManualProfile } from "@/server/candidates/actions";
import { CvUploadForm } from "@/components/recruitathon/CvUploadForm";
import { CvReviewForm, type ReviewDraft } from "@/components/recruitathon/CvReviewForm";

/**
 * Recruitathon test onboarding — states on one page:
 *  1. upload  — upload your CV (with a live parse-progress bar). If a
 *     previous parse failed, this state also shows a "couldn't read it"
 *     notice + a "fill in manually" escape hatch.
 *  2. review  — the AI-parsed details (editable) for the candidate to
 *     confirm; on confirm they're applied to the profile.
 *  3. manual  — hand-enter details when the parse couldn't read the file.
 * The ONLY requirement to reach the test is a CV on file whose details
 * step is done (parsed-and-reviewed OR manually filled) — no
 * profile-completeness gate.
 */
export const dynamic = "force-dynamic";

export default async function RecruitathonOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; manual?: string }>;
}) {
  const sp = await searchParams;
  const next =
    typeof sp.next === "string" && sp.next.startsWith("/recruitathon/") && !sp.next.startsWith("//")
      ? sp.next
      : null;
  const nextQ = next ? `&next=${encodeURIComponent(next)}` : "";
  const backTo = `/recruitathon/onboarding${next ? `?next=${encodeURIComponent(next)}` : ""}`;
  const startHref = next ?? "/recruitathon/select";

  const session = await auth();
  if (!session?.user) {
    redirect(`/signup?next=${encodeURIComponent(backTo)}`);
  }

  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
    select: { resumeUrl: true, resumeParseDraft: true, resumeParsedAt: true },
  });
  // Not a candidate (e.g. employer account) — send to the generic
  // role-aware onboarding rather than dead-ending here.
  if (!profile) redirect("/onboarding");

  const draft = profile.resumeParseDraft as ReviewDraft | null;
  const hasCV = !!profile.resumeUrl;
  const parsedDone = !!profile.resumeParsedAt;
  // Uploaded a file but the parse produced nothing and nothing's applied.
  const parseFailed = hasCV && !draft && !parsedDone;
  const manualMode = sp.manual === "1" && parseFailed;

  // Details step already complete → straight to JD matching.
  if (!draft && hasCV && parsedDone) redirect(startHref);

  const step: "upload" | "review" | "manual" = draft ? "review" : manualMode ? "manual" : "upload";
  const stepNo = step === "upload" ? 1 : 2;

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-emce-light-bg">
        <div className="container max-w-2xl py-8 md:py-12">
          <p className="text-hint font-bold uppercase tracking-wide text-emce-mid-muted">
            Recruitathon test · Step {stepNo} of 3
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-emce-text md:text-3xl">
            {step === "review" ? "Confirm your details" : step === "manual" ? "Enter your details" : "Upload your CV to begin"}
          </h1>
          <p className="mt-2 text-sm text-emce-text-sec md:text-base">
            {step === "review"
              ? "We read your CV. Take a moment to check what we pulled out, tweak anything, then continue to your role matches."
              : step === "manual"
              ? "Fill in the essentials below and continue to your role matches. Your skills drive the matching, so add a few."
              : "We'll read it with AI to match you to the best-fit roles — then you pick up to 3 and start your test."}
          </p>

          {/* Two-step indicator */}
          <div className="mt-4 flex items-center gap-2 text-xs font-bold">
            {[
              { n: 1, label: "Upload CV" },
              { n: 2, label: step === "manual" ? "Enter details" : "Confirm details" },
              { n: 3, label: "Pick roles" },
            ].map((s, i) => (
              <span key={s.n} className="flex items-center gap-2">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full ${stepNo >= s.n ? "bg-emce-dark text-emce-light" : "bg-emce-light-soft text-emce-text-sec"}`}>
                  {stepNo > s.n ? "✓" : s.n}
                </span>
                <span className={stepNo >= s.n ? "text-emce-text" : "text-emce-text-muted"}>{s.label}</span>
                {i < 2 && <span className="mx-1 text-emce-text-muted">→</span>}
              </span>
            ))}
          </div>

          {sp.error && (
            <p className="mt-4 rounded-md bg-emce-red-light p-3 text-sm font-semibold text-emce-red-deep">
              {sp.error}
            </p>
          )}

          {step === "review" && <CvReviewForm draft={draft!} next={next} action={applyRecruitathonResumeReview} />}

          {step === "manual" && (
            <CvReviewForm
              draft={{}}
              next={next}
              action={saveRecruitathonManualProfile}
              heading="Your details"
              subheading="We couldn't read your file automatically, so please fill these in. Add a few skills — they drive your role matches."
              submitLabel="Save & continue to roles →"
            />
          )}

          {step === "upload" && (
            <>
              {parseFailed && (
                <Card className="mt-4 border-emce-red/40 bg-emce-red-light/60 p-5">
                  <p className="text-section text-emce-red-deep">We couldn&apos;t read that file</p>
                  <p className="mt-1 text-sm text-emce-text-sec">
                    That can happen with scanned or image-only PDFs. Try uploading a different file (a
                    text-based PDF or DOCX works best), or enter your details manually.
                  </p>
                  <div className="mt-3">
                    <Button asChild variant="outline">
                      <Link href={`/recruitathon/onboarding?manual=1${nextQ}`}>Enter details manually →</Link>
                    </Button>
                  </div>
                </Card>
              )}

              <Card className="mt-4 p-6">
                <p className="text-section text-emce-text">{parseFailed ? "Try another file" : "Your CV"}</p>
                <p className="mt-1 text-sm text-emce-text-sec">
                  PDF or DOCX. We use it to match you to roles and pre-fill your profile — you can edit
                  anything on the next screen.
                </p>
                <CvUploadForm redirectTo={backTo} />
              </Card>
            </>
          )}

          <p className="mt-6 text-center text-hint text-emce-text-muted">
            Prefer to fill your profile by hand? You can always do that at{" "}
            <Link href="/me/profile" className="font-bold text-emce-dark hover:underline">
              your profile
            </Link>
            .
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
