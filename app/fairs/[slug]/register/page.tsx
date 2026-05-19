import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { turnstilePublicKey } from "@/lib/anti-spam";
import { CandidateRegisterForm } from "@/components/recruitathon/CandidateRegisterForm";
import { EmployerRegisterForm } from "@/components/recruitathon/EmployerRegisterForm";
import { TpoRegisterForm } from "@/components/recruitathon/TpoRegisterForm";
import { RecruitathonHeaderBar } from "@/components/recruitathon/RecruitathonHeaderBar";
import { getRecruitathonViewerStatus } from "@/lib/recruitathon/viewer-status";

/**
 * Public registration page for the Recruitathon (and any other
 * RecruitmentDrive) inline-signup. Two tabs — Candidate / Employer —
 * each rendering a long form whose server action creates the platform
 * account AND the fair registration in one transaction.
 *
 * Tab is chosen via `?as=candidate` (default) or `?as=employer`. The
 * URL is the only source of truth for the tab so a shared link
 * (placement team forwarding the candidate URL, partnership team
 * forwarding the employer URL) lands the recipient on the right
 * variant without any client-side hop.
 */

type Tab = "candidate" | "employer" | "tpo";
type Search = Promise<{ as?: string; tpo?: string }>;

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const drive = await db.recruitmentDrive.findUnique({
    where: { slug },
    select: { title: true },
  });
  return {
    title: drive ? `Register — ${drive.title}` : "Register for the fair",
    description:
      "Sign up + register for the fair in one step. We'll create your account, pre-fill your profile and email your fair pass.",
  };
}

export default async function FairRegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Search;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const tab: Tab =
    sp.as === "employer" ? "employer"
    : sp.as === "tpo" ? "tpo"
    : "candidate";
  // Optional TPO invite token from the URL. Forwarded into the
  // candidate form as a hidden field so the inline-signup action
  // tags the registration with viaTpoCellId. We DON'T attempt to
  // resolve the cell name here for pre-fill — keeps the page a
  // server component and the redirect path simple. The dashboard
  // CSVs / TPO stats use the token-id link.
  const tpoToken = typeof sp.tpo === "string" && sp.tpo.length <= 64 ? sp.tpo : null;

  const drive = await db.recruitmentDrive.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
      tagline: true,
      city: true,
      state: true,
      startsAt: true,
      endsAt: true,
      status: true,
      registrationClosesAt: true,
    },
  });
  if (!drive) notFound();

  // Look up the TPO cell only when the token is present — most
  // visits don't use a TPO link so we skip the round-trip.
  const tpoReferral = tpoToken
    ? await db.collegePlacementCell.findUnique({
        where: { inviteToken: tpoToken },
        select: {
          status: true,
          institution: { select: { name: true } },
          contactName: true,
        },
      })
    : null;
  const tpoActive = tpoReferral?.status === "APPROVED" ? tpoReferral : null;

  // ─── Signed-in session + pre-redirect for already-registered ───
  // Detect session up-front; pass identity to form so it can hide
  // the auth fieldset. Also short-circuit any persona whose viewer
  // has already completed the relevant registration — avoids them
  // staring at a form they'd just hit "already registered" on. The
  // welcome screen already handles the post-registration UX cleanly.
  const session = await auth();
  const signedInUser = session?.user
    ? { name: session.user.name ?? null, email: session.user.email ?? "" }
    : null;

  if (signedInUser) {
    if (tab === "candidate") {
      const existing = await db.candidateProfile.findUnique({
        where: { userId: session!.user!.id },
        select: { fairRegistrations: { where: { driveId: drive.id }, select: { id: true }, take: 1 } },
      });
      if (existing && existing.fairRegistrations.length > 0) {
        redirect(`/fairs/${drive.slug}/registered?as=candidate`);
      }
    } else if (tab === "employer") {
      const emp = await db.employerProfile.findUnique({
        where: { userId: session!.user!.id },
        select: {
          company: {
            select: {
              recruitmentDriveParticipations: {
                where: { driveId: drive.id },
                select: { id: true },
                take: 1,
              },
            },
          },
        },
      });
      if (emp && emp.company.recruitmentDriveParticipations.length > 0) {
        redirect(`/fairs/${drive.slug}/registered?as=employer`);
      }
    } else if (tab === "tpo") {
      const cell = await db.collegePlacementCell.findFirst({
        where: { createdById: session!.user!.id },
        select: { id: true },
      });
      if (cell) {
        // Any status (PENDING / APPROVED / REJECTED / REVOKED) →
        // welcome screen handles the messaging. Stops dup-submission.
        redirect(`/fairs/${drive.slug}/registered?as=tpo`);
      }
    }
  }

  // Registration-closed banner — render the page (so users can still
  // see what they missed) but disable the form by short-circuiting
  // to a notice card. RecruitmentDriveStatus DRAFT also blocks since
  // unpublished fairs shouldn't be discoverable.
  const isClosed =
    drive.status !== "OPEN" && drive.status !== "IN_PROGRESS";
  const registrationClosed =
    isClosed ||
    (drive.registrationClosesAt && drive.registrationClosesAt < new Date());

  const when = new Date(drive.startsAt).toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const place = [drive.city, drive.state].filter(Boolean).join(", ");

  return (
    <>
      <SiteHeader />
      <RecruitathonHeaderBar
        driveSlug={drive.slug}
        driveTitle={drive.title}
        registrationOpen={!registrationClosed}
        viewerStatus={await getRecruitathonViewerStatus(session?.user?.id ?? null, drive.id)}
      />
      <div className="container max-w-3xl py-8 md:py-12">
        <Link href={`/fairs/${drive.slug}`} className="text-xs font-bold text-emce-dark hover:underline">
          ← {drive.title}
        </Link>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-emce-text md:text-3xl">
          Register for {drive.title}
        </h1>
        <p className="mt-1 text-sm text-emce-text-sec">
          📅 {when} · 📍 {place}
        </p>
        {drive.tagline && (
          <p className="mt-2 text-sm italic text-emce-text-sec">{drive.tagline}</p>
        )}

        {registrationClosed ? (
          <Card className="mt-6 p-6 text-center">
            <h2 className="text-section text-emce-text">Registration closed</h2>
            <p className="mt-2 text-sm text-emce-text-sec">
              Registration for this fair is no longer accepting new sign-ups.
              You can still browse the booths + sessions on the{" "}
              <Link href={`/fairs/${drive.slug}`} className="font-bold text-emce-dark hover:underline">
                fair page
              </Link>.
            </p>
          </Card>
        ) : (
          <>
            {/* Tab switcher — Link-based so the URL is the source of
                truth + a shared link lands the recipient on the right
                tab. The tpoToken is preserved across candidate /
                employer / tpo tab hops so a candidate who lands on the
                employer tab by mistake doesn't lose the referral when
                they correct it. */}
            <nav aria-label="Choose registration type" className="mt-6 grid grid-cols-3 gap-2 rounded-md bg-emce-light-soft p-1">
              <Link
                href={`/fairs/${drive.slug}/register?as=candidate${tpoToken ? `&tpo=${encodeURIComponent(tpoToken)}` : ""}`}
                aria-current={tab === "candidate" ? "page" : undefined}
                className={`rounded p-2 text-center text-sm font-bold transition ${
                  tab === "candidate"
                    ? "bg-emce-dark text-emce-light"
                    : "text-emce-text-sec hover:bg-white"
                }`}
              >
                🎓 Candidate
              </Link>
              <Link
                href={`/fairs/${drive.slug}/register?as=employer`}
                aria-current={tab === "employer" ? "page" : undefined}
                className={`rounded p-2 text-center text-sm font-bold transition ${
                  tab === "employer"
                    ? "bg-emce-dark text-emce-light"
                    : "text-emce-text-sec hover:bg-white"
                }`}
              >
                🏢 Employer
              </Link>
              <Link
                href={`/fairs/${drive.slug}/register?as=tpo`}
                aria-current={tab === "tpo" ? "page" : undefined}
                className={`rounded p-2 text-center text-sm font-bold transition ${
                  tab === "tpo"
                    ? "bg-emce-dark text-emce-light"
                    : "text-emce-text-sec hover:bg-white"
                }`}
              >
                📋 TPO / College
              </Link>
            </nav>

            {/* TPO referral acknowledgement banner — shown only on the
                candidate tab when the URL carries a valid + active
                invite token. Confirms to the student that they're
                being credited to the right college without making them
                fill anything extra. */}
            {tab === "candidate" && tpoActive && (
              <div className="mt-4 rounded-md border border-emce-mid bg-emce-light-soft p-3 text-sm text-emce-text">
                📋 Registering via <strong>{tpoActive.institution.name}</strong>
                {tpoActive.contactName && <> ({tpoActive.contactName})</>} — your
                Training & Placement Officer will see your registration in their
                dashboard.
              </div>
            )}

            <Card className="mt-4 p-6 md:p-8">
              {tab === "candidate" ? (
                <CandidateRegisterForm
                  driveSlug={drive.slug}
                  turnstileSiteKey={turnstilePublicKey}
                  tpoToken={tpoToken && tpoActive ? tpoToken : null}
                  signedInUser={signedInUser}
                />
              ) : tab === "employer" ? (
                <EmployerRegisterForm
                  driveSlug={drive.slug}
                  turnstileSiteKey={turnstilePublicKey}
                  signedInUser={signedInUser}
                />
              ) : (
                <TpoRegisterForm
                  driveSlug={drive.slug}
                  turnstileSiteKey={turnstilePublicKey}
                  signedInUser={signedInUser}
                />
              )}
            </Card>

            <p className="mt-4 text-center text-hint text-emce-text-sec">
              We create your platform account + register you for the fair in one
              shot. After this you&apos;ll get a 5-minute prompt to round out your
              profile so recruiters / candidates can find you.
            </p>
          </>
        )}
      </div>
      <SiteFooter />
    </>
  );
}
