import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import {
  ProfileCompletionBanner,
  getCompletenessForUser,
} from "@/components/recruitathon/ProfileCompletionBanner";
import { RecruitathonHeaderBar } from "@/components/recruitathon/RecruitathonHeaderBar";
import { getRecruitathonViewerStatus } from "@/lib/recruitathon/viewer-status";

/**
 * Post-inline-signup celebration screen for /fairs/[slug]/register.
 *
 * Shows:
 *   1. ✓ "You're registered" confirmation + check-in code
 *   2. Profile-completion banner (3 cheapest next steps) — the
 *      conversion hook from "form submitted" to "complete profile"
 *   3. CTAs to upload résumé / explore the fair
 *
 * Authenticated-only. Routes a logged-out user back to /signin
 * pointing at this URL so a refresh after their session expires
 * still lands them on the right page.
 */

export const metadata: Metadata = { title: "You're registered ✓" };

export default async function FairRegisteredPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ as?: string; fresh?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const as =
    sp.as === "employer" ? "employer"
    : sp.as === "tpo" ? "tpo"
    : "candidate";
  const isFresh = sp.fresh === "1";

  const session = await auth();
  if (!session?.user) {
    redirect(`/signin?next=${encodeURIComponent(`/fairs/${slug}/registered?as=${as}`)}`);
  }

  const drive = await db.recruitmentDrive.findUnique({
    where: { slug },
    select: {
      id: true, slug: true, title: true, city: true, state: true,
      startsAt: true, endsAt: true,
    },
  });
  if (!drive) notFound();

  if (as === "employer") {
    return <EmployerRegistered drive={drive} userId={session.user.id} fresh={isFresh} />;
  }
  if (as === "tpo") {
    return <TpoRegistered drive={drive} userId={session.user.id} fresh={isFresh} />;
  }
  return <CandidateRegistered drive={drive} userId={session.user.id} fresh={isFresh} />;
}

// ─── Candidate variant ────────────────────────────────────────────
async function CandidateRegistered({
  drive,
  userId,
  fresh,
}: {
  drive: { id: string; slug: string; title: string; city: string; state: string | null; startsAt: Date };
  userId: string;
  fresh: boolean;
}) {
  // Find the candidate's registration row + profile so the welcome
  // screen can show the check-in code + run completeness.
  const profile = await db.candidateProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      fairRegistrations: {
        where: { driveId: drive.id },
        select: { checkInCode: true, fairMode: true },
        take: 1,
      },
    },
  });
  if (!profile) redirect("/onboarding");
  const reg = profile.fairRegistrations[0];
  if (!reg) redirect(`/fairs/${drive.slug}/register?as=candidate`);

  const completeness = await getCompletenessForUser(userId);
  const place = [drive.city, drive.state].filter(Boolean).join(", ");
  const when = new Date(drive.startsAt).toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <>
      <SiteHeader />
      <RecruitathonHeaderBar
        driveSlug={drive.slug}
        driveTitle={drive.title}
        registrationOpen={true}
        viewerStatus={await getRecruitathonViewerStatus(userId, drive.id)}
      />
      <div className="container max-w-3xl py-8 md:py-12">
        <Card className="border-emce-mid bg-gradient-to-br from-white to-emce-light-soft p-8 text-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emce-mid text-2xl">
            ✓
          </span>
          <h1 className="mt-3 text-2xl font-extrabold text-emce-text md:text-3xl">
            You&apos;re registered for {drive.title}
          </h1>
          <p className="mt-1 text-sm text-emce-text-sec">
            📅 {when} · 📍 {place}
          </p>
          <div className="mt-5 inline-block rounded-lg border-2 border-emce-mid bg-white px-5 py-3 text-left">
            <p className="text-[10px] font-bold uppercase tracking-wider text-emce-text-sec">
              Your check-in code
            </p>
            <p className="font-mono text-3xl font-extrabold tracking-[0.2em] text-emce-text">
              {reg.checkInCode}
            </p>
          </div>
          <p className="mt-3 text-hint text-emce-text-sec">
            Show this at the venue check-in desk. We&apos;ll also email it to you.
          </p>
        </Card>

        {fresh && (
          <div className="mt-6 rounded-md border border-emce-mid bg-emce-light-soft p-3 text-sm text-emce-text">
            <strong>Welcome to emobility.careers ✨</strong> — your account is
            ready. Complete your profile below so recruiters at the fair can
            find + contact you.
          </div>
        )}

        {completeness && (
          <div className="mt-6">
            <ProfileCompletionBanner result={completeness} variant="welcome" />
          </div>
        )}

        <Card className="mt-6 p-5">
          <h2 className="text-section text-emce-text">What&apos;s next</h2>
          <ul className="mt-3 space-y-2 text-sm text-emce-text">
            <li className="flex items-start gap-2">
              <span>📄</span>
              <span>
                Upload your résumé from{" "}
                <Link href="/me/profile#resume" className="font-bold text-emce-dark hover:underline">
                  your profile
                </Link>{" "}
                — recruiters scan résumés before booking interviews.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span>🎫</span>
              <span>
                Save your fair pass at{" "}
                <Link href={`/me/fairs/${drive.slug}/pass`} className="font-bold text-emce-dark hover:underline">
                  /me/fairs/{drive.slug}/pass
                </Link>{" "}
                so you can pull it up offline at the venue.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span>🏢</span>
              <span>
                Browse the participating companies on the{" "}
                <Link href={`/fairs/${drive.slug}`} className="font-bold text-emce-dark hover:underline">
                  fair page
                </Link>{" "}
                and book interview slots ahead of time.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span>💬</span>
              <span>
                Connect with other registered candidates from your{" "}
                <Link href="/network" className="font-bold text-emce-dark hover:underline">
                  Network tab
                </Link>.
              </span>
            </li>
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/me/profile">Complete profile →</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/fairs/${drive.slug}`}>Browse the fair</Link>
            </Button>
          </div>
        </Card>
      </div>
      <SiteFooter />
    </>
  );
}

// ─── Employer variant ────────────────────────────────────────────
async function EmployerRegistered({
  drive,
  userId,
  fresh,
}: {
  drive: { id: string; slug: string; title: string; city: string; state: string | null; startsAt: Date };
  userId: string;
  fresh: boolean;
}) {
  const employer = await db.employerProfile.findUnique({
    where: { userId },
    select: {
      companyId: true,
      isCompanyAdmin: true,
      company: {
        select: {
          slug: true,
          name: true,
          recruitmentDriveParticipations: {
            where: { driveId: drive.id },
            select: { status: true, fairMode: true, hiresFreshers: true, providesTraining: true },
            take: 1,
          },
        },
      },
    },
  });
  if (!employer) redirect("/employer/onboarding");
  const participation = employer.company.recruitmentDriveParticipations[0];

  const place = [drive.city, drive.state].filter(Boolean).join(", ");
  const when = new Date(drive.startsAt).toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <>
      <SiteHeader />
      <RecruitathonHeaderBar
        driveSlug={drive.slug}
        driveTitle={drive.title}
        registrationOpen={true}
        viewerStatus={await getRecruitathonViewerStatus(userId, drive.id)}
      />
      <div className="container max-w-3xl py-8 md:py-12">
        <Card className="border-emce-mid bg-gradient-to-br from-white to-emce-light-soft p-8 text-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emce-mid text-2xl">
            ✓
          </span>
          <h1 className="mt-3 text-2xl font-extrabold text-emce-text md:text-3xl">
            {employer.company.name} is registered for {drive.title}
          </h1>
          <p className="mt-1 text-sm text-emce-text-sec">
            📅 {when} · 📍 {place}
          </p>
          <p className="mt-3 inline-block rounded-md bg-emce-amber-soft px-3 py-1 text-xs font-bold uppercase tracking-wider text-emce-amber-deep">
            Awaiting admin review
          </p>
          <p className="mt-2 text-hint text-emce-text-sec">
            Our placement team will review your registration + assign you a
            booth. We&apos;ll email you within 2 business days.
          </p>
        </Card>

        {fresh && (
          <div className="mt-6 rounded-md border border-emce-mid bg-emce-light-soft p-3 text-sm text-emce-text">
            <strong>Welcome to emobility.careers ✨</strong> — your employer
            account is ready. Complete the steps below to be fully fair-ready
            before booth assignment.
          </div>
        )}

        <Card className="mt-6 p-5">
          <h2 className="text-section text-emce-text">What to do next</h2>
          <ul className="mt-3 space-y-3 text-sm text-emce-text">
            <li className="flex items-start gap-2">
              <span>📝</span>
              <div>
                <strong className="block font-bold text-emce-text">Post your job descriptions</strong>
                <span className="text-emce-text-sec">
                  Detailed JDs help candidates self-screen + show up to your
                  booth with the right context.{" "}
                  <Link href="/employer/jobs/new" className="font-bold text-emce-dark hover:underline">
                    Post a job →
                  </Link>
                </span>
              </div>
            </li>
            <li className="flex items-start gap-2">
              <span>🏢</span>
              <div>
                <strong className="block font-bold text-emce-text">Complete your company page</strong>
                <span className="text-emce-text-sec">
                  Logo + about + benefits + tech-stack — candidates compare you
                  against other booths.{" "}
                  <Link href="/employer/company" className="font-bold text-emce-dark hover:underline">
                    Edit company →
                  </Link>
                </span>
              </div>
            </li>
            <li className="flex items-start gap-2">
              <span>👥</span>
              <div>
                <strong className="block font-bold text-emce-text">Invite your hiring team</strong>
                <span className="text-emce-text-sec">
                  Add recruiters + hiring managers so they can review candidates
                  + book interview slots at the booth.{" "}
                  <Link href="/employer/team" className="font-bold text-emce-dark hover:underline">
                    Invite team →
                  </Link>
                </span>
              </div>
            </li>
            <li className="flex items-start gap-2">
              <span>📊</span>
              <div>
                <strong className="block font-bold text-emce-text">Set fair participation details</strong>
                <span className="text-emce-text-sec">
                  Mode: <strong>{participation?.fairMode ?? "—"}</strong> ·
                  Freshers: <strong>{participation?.hiresFreshers ? "Yes" : "No"}</strong> ·
                  Training: <strong>{participation?.providesTraining ? "Yes" : "No"}</strong>.{" "}
                  <Link href={`/employer/fairs`} className="font-bold text-emce-dark hover:underline">
                    Manage fair settings →
                  </Link>
                </span>
              </div>
            </li>
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/employer">Open employer dashboard →</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/fairs/${drive.slug}`}>View fair page</Link>
            </Button>
          </div>
        </Card>
      </div>
      <SiteFooter />
    </>
  );
}

// ─── TPO variant ─────────────────────────────────────────────────
// Different shape from candidate / employer — the TPO is always
// admin-reviewed BEFORE their dashboard / invite link unlocks, so
// this screen sets that expectation rather than throwing them into
// a half-functional console. Three states:
//   • PENDING — show the "we're reviewing" pitch + what to expect
//   • APPROVED — show the invite link with copy-to-clipboard
//   • REJECTED — show the rejection reason + "re-apply" CTA
async function TpoRegistered({
  drive,
  userId,
  fresh,
}: {
  drive: { id: string; slug: string; title: string; city: string; state: string | null; startsAt: Date };
  userId: string;
  fresh: boolean;
}) {
  const cell = await db.collegePlacementCell.findFirst({
    where: { createdById: userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, status: true, designation: true, contactName: true,
      contactEmail: true, studentCount: true, rejectionReason: true,
      inviteToken: true,
      institution: { select: { id: true, slug: true, name: true } },
    },
  });
  if (!cell) {
    // No cell yet — unusual but possible if the user lands here
    // directly. Point them at the inline-signup form instead of
    // 404'ing.
    redirect(`/fairs/${drive.slug}/register?as=tpo`);
  }

  const place = [drive.city, drive.state].filter(Boolean).join(", ");
  const when = new Date(drive.startsAt).toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <>
      <SiteHeader />
      <RecruitathonHeaderBar
        driveSlug={drive.slug}
        driveTitle={drive.title}
        registrationOpen={true}
        viewerStatus={await getRecruitathonViewerStatus(userId, drive.id)}
      />
      <div className="container max-w-3xl py-8 md:py-12">
        <Card className="border-emce-mid bg-gradient-to-br from-white to-emce-light-soft p-8 text-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emce-mid text-2xl">
            {cell.status === "APPROVED" ? "✓" : cell.status === "REJECTED" ? "✗" : "📋"}
          </span>
          <h1 className="mt-3 text-2xl font-extrabold text-emce-text md:text-3xl">
            {cell.status === "APPROVED"
              ? `${cell.institution.name} — TPO account active`
              : cell.status === "REJECTED"
              ? "Application not approved"
              : `Application received from ${cell.institution.name}`}
          </h1>
          <p className="mt-1 text-sm text-emce-text-sec">
            For {drive.title} · 📅 {when} · 📍 {place}
          </p>
          {cell.status === "PENDING" && (
            <p className="mt-3 inline-block rounded-md bg-emce-amber-soft px-3 py-1 text-xs font-bold uppercase tracking-wider text-emce-amber-deep">
              Pending review · ~2 business days
            </p>
          )}
        </Card>

        {fresh && cell.status === "PENDING" && (
          <div className="mt-6 rounded-md border border-emce-mid bg-emce-light-soft p-3 text-sm text-emce-text">
            <strong>Welcome to emobility.careers ✨</strong> — your account is
            ready. Once our team verifies your college affiliation, your TPO
            dashboard + shareable student-invite link will unlock automatically.
          </div>
        )}

        {/* APPROVED state — show the invite link prominently. The
            actual copy-to-clipboard UX lives in /tpo (the dashboard
            re-renders this with a real Copy button). Here we just
            show the URL so the TPO can grab it pre-dashboard. */}
        {cell.status === "APPROVED" && cell.inviteToken && (
          <Card className="mt-6 p-5">
            <h2 className="text-section text-emce-text">📨 Your invite link</h2>
            <p className="mt-1 text-hint text-emce-text-sec">
              Share this URL with your students. Anyone who registers via this
              link is automatically credited to {cell.institution.name} in
              your dashboard.
            </p>
            <div className="mt-3 rounded-md border border-emce-border bg-emce-light-soft p-3 font-mono text-sm break-all">
              {`${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/fairs/${drive.slug}/register?as=candidate&tpo=${cell.inviteToken}`}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/tpo">Open TPO dashboard →</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/tpo/import">Bulk-import students from CSV</Link>
              </Button>
            </div>
          </Card>
        )}

        {/* REJECTED state — show the reason + re-apply CTA. */}
        {cell.status === "REJECTED" && (
          <Card className="mt-6 p-5">
            <h2 className="text-section text-emce-text">Why was this rejected?</h2>
            <p className="mt-2 text-sm text-emce-text">
              {cell.rejectionReason ?? "No specific reason was provided."}
            </p>
            <p className="mt-3 text-hint text-emce-text-sec">
              You can update your details + re-apply.{" "}
              <Link href="/colleges/register" className="font-bold text-emce-dark hover:underline">
                Re-apply →
              </Link>
            </p>
          </Card>
        )}

        {/* PENDING state — set expectations + give them productive
            things to do while they wait. */}
        {cell.status === "PENDING" && (
          <Card className="mt-6 p-5">
            <h2 className="text-section text-emce-text">What to do while you wait</h2>
            <ul className="mt-3 space-y-3 text-sm text-emce-text">
              <li className="flex items-start gap-2">
                <span>📧</span>
                <div>
                  <strong className="block font-bold text-emce-text">Check your inbox</strong>
                  <span className="text-emce-text-sec">
                    We sent a verification link to <strong>{cell.contactEmail}</strong>.
                    Click it now so your account is fully verified before
                    approval — keeps the activation step instant.
                  </span>
                </div>
              </li>
              <li className="flex items-start gap-2">
                <span>📋</span>
                <div>
                  <strong className="block font-bold text-emce-text">Prepare your student roster CSV</strong>
                  <span className="text-emce-text-sec">
                    The TPO import expects columns: email, full name, phone,
                    course name, graduation year. Get yours ready so you can
                    bulk-import the moment approval lands.
                  </span>
                </div>
              </li>
              <li className="flex items-start gap-2">
                <span>🎓</span>
                <div>
                  <strong className="block font-bold text-emce-text">Browse the fair page</strong>
                  <span className="text-emce-text-sec">
                    See which companies are registered + which roles they have
                    open at{" "}
                    <Link href={`/fairs/${drive.slug}`} className="font-bold text-emce-dark hover:underline">
                      /fairs/{drive.slug}
                    </Link>
                    {" "}— useful context when you brief your students.
                  </span>
                </div>
              </li>
            </ul>
          </Card>
        )}
      </div>
      <SiteFooter />
    </>
  );
}
