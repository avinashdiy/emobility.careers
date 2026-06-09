import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { CameraMicTest } from "@/components/recruitathon/CameraMicTest";

export const metadata: Metadata = {
  title: "Test your camera + mic",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * Camera + mic self-test page for ONLINE / HYBRID candidates.
 * Bounces back to the fair pass if the candidate isn't registered
 * or if their registration mode is OFFLINE (the test is meaningless
 * for in-person attendees — they're walking up to a booth).
 *
 * The actual getUserMedia harness lives in the CameraMicTest
 * client component; this page is just the auth + registration
 * lookup + copy. After the candidate confirms ready, the server
 * action stamps `interviewReadyAt` so the recruiter board can show
 * a green-dot readiness indicator on their slot.
 */
export default async function FairTestCallPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/signin?next=/me/fairs/${slug}/test-call`);

  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!profile) redirect("/onboarding");

  const drive = await db.recruitmentDrive.findUnique({
    where: { slug },
    select: { id: true, slug: true, title: true, startsAt: true, endsAt: true },
  });
  if (!drive) notFound();

  const reg = await db.recruitmentDriveRegistration.findUnique({
    where: { driveId_candidateId: { driveId: drive.id, candidateId: profile.id } },
    select: { id: true, fairMode: true, interviewReadyAt: true, cancelledAt: true },
  });
  if (!reg || reg.cancelledAt) {
    redirect(
      `/fairs/${slug}?notice=` +
        encodeURIComponent("Register for the fair first — then test your camera."),
    );
  }
  // OFFLINE candidates don't need the test — bounce them back.
  if (reg.fairMode === "OFFLINE") {
    redirect(
      `/me/fairs/${slug}/pass?notice=` +
        encodeURIComponent("You registered as in-person — no camera test needed."),
    );
  }

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-emce-light-bg py-8 md:py-12">
        <div className="container max-w-2xl space-y-4">
          <Link
            href={`/me/fairs/${slug}/pass`}
            className="text-hint font-bold text-emce-text-sec hover:text-emce-dark"
          >
            ← Back to fair pass
          </Link>

          <Card className="p-6 md:p-8">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emce-mid-muted">
              Camera + mic self-test
            </p>
            <div className="mt-1 flex flex-wrap items-baseline gap-2">
              <h1 className="text-2xl font-extrabold leading-tight text-emce-text md:text-[28px]">
                {drive.title}
              </h1>
              {reg.interviewReadyAt && (
                <Badge variant="success">✓ Setup tested</Badge>
              )}
            </div>
            <p className="mt-2 text-body text-emce-text-sec">
              Before your online interview, take 30 seconds to confirm
              your camera and microphone work. The recruiter sees a
              green dot next to your name once you&apos;ve tested, so
              they know you&apos;re ready.
            </p>

            <div className="mt-6">
              <CameraMicTest
                driveSlug={slug}
                alreadyReady={Boolean(reg.interviewReadyAt)}
              />
            </div>

            <div className="mt-6 border-t border-emce-border pt-4 text-hint text-emce-text-sec">
              <p>
                <strong className="text-emce-text">Privacy:</strong> we
                don&apos;t record anything. Your video + audio stay in
                your browser — only the &quot;tested&quot; flag is
                saved.
              </p>
              <p className="mt-1">
                <strong className="text-emce-text">Tip:</strong> if your
                Wi-Fi is patchy, switch to mobile hotspot 5 minutes
                before your slot — video calls are bandwidth-hungry.
              </p>
            </div>
          </Card>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
