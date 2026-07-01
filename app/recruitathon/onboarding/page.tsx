import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { CvUploadForm } from "@/components/recruitathon/CvUploadForm";
import { CvReviewForm, type ReviewDraft } from "@/components/recruitathon/CvReviewForm";

/**
 * Recruitathon test onboarding — two states, one page:
 *  1. Upload your CV (with a live parse-progress bar).
 *  2. Review the AI-parsed details (editable) and confirm.
 * On confirm the parse is applied to the profile and we continue to JD
 * matching. The ONLY requirement to reach the test is a CV on file —
 * there is no profile-completeness gate.
 */
export const dynamic = "force-dynamic";

export default async function RecruitathonOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const next =
    typeof sp.next === "string" && sp.next.startsWith("/recruitathon/") && !sp.next.startsWith("//")
      ? sp.next
      : null;
  const backTo = `/recruitathon/onboarding${next ? `?next=${encodeURIComponent(next)}` : ""}`;
  const startHref = next ?? "/recruitathon/select";

  const session = await auth();
  if (!session?.user) {
    redirect(`/signup?next=${encodeURIComponent(backTo)}`);
  }

  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
    select: { resumeUrl: true, resumeParseDraft: true },
  });
  // Not a candidate (e.g. employer account) — send to the generic
  // role-aware onboarding rather than dead-ending here.
  if (!profile) redirect("/onboarding");

  const draft = profile.resumeParseDraft as ReviewDraft | null;
  const step: "upload" | "review" = draft ? "review" : "upload";

  // No pending draft and a CV already applied → straight to JD matching.
  if (!draft && profile.resumeUrl) redirect(startHref);

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-emce-light-bg">
        <div className="container max-w-2xl py-8 md:py-12">
          <p className="text-hint font-bold uppercase tracking-wide text-emce-mid-muted">
            Recruitathon test · {step === "upload" ? "one quick step" : "quick check"}
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-emce-text md:text-3xl">
            {step === "upload" ? "Upload your CV to begin" : "Confirm your details"}
          </h1>
          <p className="mt-2 text-sm text-emce-text-sec md:text-base">
            {step === "upload"
              ? "We'll read it with AI to match you to the best-fit roles — then you pick up to 3 and start your test."
              : "We read your CV. Take a moment to check what we pulled out, tweak anything, then continue to your role matches."}
          </p>

          {/* Two-step indicator */}
          <div className="mt-4 flex items-center gap-2 text-xs font-bold">
            {[
              { n: 1, label: "Upload CV" },
              { n: 2, label: "Confirm details" },
              { n: 3, label: "Pick roles" },
            ].map((s, i) => {
              const cur = step === "upload" ? 1 : 2;
              return (
                <span key={s.n} className="flex items-center gap-2">
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full ${cur >= s.n ? "bg-emce-dark text-emce-light" : "bg-emce-light-soft text-emce-text-sec"}`}>
                    {cur > s.n ? "✓" : s.n}
                  </span>
                  <span className={cur >= s.n ? "text-emce-text" : "text-emce-text-muted"}>{s.label}</span>
                  {i < 2 && <span className="mx-1 text-emce-text-muted">→</span>}
                </span>
              );
            })}
          </div>

          {sp.error && (
            <p className="mt-4 rounded-md bg-emce-red-light p-3 text-sm font-semibold text-emce-red-deep">
              {sp.error}
            </p>
          )}

          {step === "upload" ? (
            <Card className="mt-5 p-6">
              <p className="text-section text-emce-text">Your CV</p>
              <p className="mt-1 text-sm text-emce-text-sec">
                PDF or DOCX. We use it to match you to roles and pre-fill your profile — you can edit
                anything on the next screen.
              </p>
              <CvUploadForm redirectTo={backTo} />
            </Card>
          ) : (
            <CvReviewForm draft={draft!} next={next} />
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
