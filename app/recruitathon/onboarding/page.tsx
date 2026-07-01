import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { uploadAndParseResume } from "@/server/candidates/actions";

/**
 * Recruitathon test onboarding — a single step: upload your CV. We parse
 * it with AI (which also autofills your profile) and send you straight
 * to JD matching. The ONLY requirement to reach the test is a CV on
 * file — there is no profile-completeness gate.
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
    select: { resumeUrl: true },
  });
  // Not a candidate (e.g. employer account) — send to the generic
  // role-aware onboarding rather than dead-ending here.
  if (!profile) redirect("/onboarding");

  // CV on file is the only requirement — go straight to JD matching.
  if (profile.resumeUrl) redirect(startHref);

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-emce-light-bg">
        <div className="container max-w-2xl py-8 md:py-12">
          <p className="text-hint font-bold uppercase tracking-wide text-emce-mid-muted">
            Recruitathon test · one quick step
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-emce-text md:text-3xl">
            Upload your CV to begin
          </h1>
          <p className="mt-2 text-sm text-emce-text-sec md:text-base">
            We&apos;ll read it with AI to match you to the best-fit roles — then you pick up to 3 and
            start your test. That&apos;s the whole setup.
          </p>

          {sp.error && (
            <p className="mt-4 rounded-md bg-emce-red-light p-3 text-sm font-semibold text-emce-red-deep">
              {sp.error}
            </p>
          )}

          <Card className="mt-5 p-6">
            <p className="text-section text-emce-text">Your CV</p>
            <p className="mt-1 text-sm text-emce-text-sec">
              PDF or DOCX. We use it to match you to roles and pre-fill your profile — you can edit
              anything later from your profile.
            </p>
            <form action={uploadAndParseResume} className="mt-4 space-y-3">
              <input type="hidden" name="redirectTo" value={backTo} />
              <input
                type="file"
                name="resume"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                required
                className="block w-full text-sm text-emce-text-sec file:mr-3 file:rounded-md file:border-0 file:bg-emce-dark file:px-4 file:py-2 file:text-sm file:font-bold file:text-emce-light hover:file:bg-emce-darkest"
              />
              <Button type="submit" size="lg">
                Upload &amp; find my roles →
              </Button>
            </form>
          </Card>

          <p className="mt-4 text-center text-hint text-emce-text-muted">
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
