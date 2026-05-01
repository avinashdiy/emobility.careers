import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
// Don't import SiteHeader / SiteFooter here — `app/me/layout.tsx`
// already renders them. Importing again would double-stack the bar.
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";
import { IDVerificationForm } from "@/components/profile/IDVerificationForm";

export const metadata = { title: "Verify your profile" };

const STATUS_COPY: Record<
  string,
  { label: string; tone: "default" | "warning" | "success" | "danger"; helper: string }
> = {
  NONE: {
    label: "Not submitted",
    tone: "default",
    helper:
      "Submit a clear image of your Aadhar (or another government ID) to get the verified badge — the blue checkmark next to your name across the platform.",
  },
  PENDING: {
    label: "Under review",
    tone: "warning",
    helper:
      "Your submission is in the admin queue. We typically review within 24 hours. We'll email you the moment it's actioned.",
  },
  VERIFIED: {
    label: "Verified ✓",
    tone: "success",
    helper:
      "Your profile shows the verified badge to recruiters across the feed, your public profile, and every application you submit.",
  },
  REJECTED: {
    label: "Couldn't verify",
    tone: "danger",
    helper:
      "Your previous submission couldn't be verified. Read the reviewer notes below, then re-submit a clearer image.",
  },
};

export default async function MyVerifyPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin?next=/me/verify");
  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
    select: {
      id: true,
      idVerificationStatus: true,
      idVerificationSubmittedAt: true,
      idVerificationReviewedAt: true,
      idVerificationNotes: true,
    },
  });
  if (!profile) redirect("/onboarding");

  const status = profile.idVerificationStatus ?? "NONE";
  const meta = STATUS_COPY[status] ?? STATUS_COPY.NONE;

  return (
    <>
      <div className="container max-w-2xl py-10">
        <div className="mb-2 flex items-center gap-2">
          <h1 className="text-dashboard text-emce-text">Verify your profile</h1>
          {status === "VERIFIED" && <VerifiedBadge size={22} />}
        </div>
        <p className="text-sm text-emce-text-sec">
          The verified badge tells recruiters that we've checked your real
          identity against a government ID — distinct from your DIYguru course
          completion or your work-email verification.
        </p>

        <Card className="mt-6 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={meta.tone}>{meta.label}</Badge>
            {profile.idVerificationSubmittedAt && (
              <span className="text-hint text-emce-text-muted">
                Submitted {profile.idVerificationSubmittedAt.toLocaleDateString()}
              </span>
            )}
            {profile.idVerificationReviewedAt && (
              <span className="text-hint text-emce-text-muted">
                Reviewed {profile.idVerificationReviewedAt.toLocaleDateString()}
              </span>
            )}
          </div>
          <p className="mt-3 text-sm text-emce-text-sec">{meta.helper}</p>
          {status === "REJECTED" && profile.idVerificationNotes && (
            <div className="mt-3 rounded-md bg-emce-red-light p-3 text-sm text-emce-red">
              <strong>Reviewer notes:</strong> {profile.idVerificationNotes}
            </div>
          )}
        </Card>

        {status !== "VERIFIED" && (
          <Card className="mt-4 p-5">
            <h2 className="text-section text-emce-text">
              {status === "PENDING" ? "Submission" : "Submit your ID"}
            </h2>
            <p className="mt-1 text-hint text-emce-text-sec">
              JPEG, PNG, WebP or PDF up to 6 MB. The image is stored privately —
              only admins reviewing your request can see it. We never store your
              Aadhar number itself, just the document.
            </p>
            <div className="mt-3">
              <IDVerificationForm
                status={status as "NONE" | "PENDING" | "VERIFIED" | "REJECTED"}
              />
            </div>
          </Card>
        )}

        <Card className="mt-4 p-5">
          <h2 className="text-section text-emce-text">Privacy</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-emce-text-sec">
            <li>The uploaded ID image is stored in our private bucket — not browseable.</li>
            <li>Only admins reviewing the queue can view it, via short-lived presigned links.</li>
            <li>
              We don't extract / store the Aadhar number. The image is purely for
              face-and-name match against your profile.
            </li>
            <li>
              On account deletion the image is removed alongside the rest of your data —
              see <Link href="/privacy" className="font-bold text-emce-dark underline">privacy policy</Link>.
            </li>
          </ul>
        </Card>
      </div>
    </>
  );
}
