import Link from "next/link";
import type { RecruitathonViewerStatus } from "@/lib/recruitathon/viewer-status";

/**
 * Sticky sub-header bar that renders directly below SiteHeader on
 * every Recruitathon (and any other RecruitmentDrive) public page —
 * /fairs/[slug], /fairs/[slug]/register, /fairs/[slug]/registered.
 *
 * Three CTAs always visible (regardless of viewport scroll) so a
 * visitor doesn't need to scroll back to the hero to pick a
 * registration path. On mobile we collapse the labels to short
 * forms but keep all three taps available — placement-team WhatsApp
 * shares land disproportionately on phones.
 *
 * Context-aware: when a `viewerStatus` is provided, each CTA swaps
 * to a "View pass / dashboard" affordance for any persona the viewer
 * has already registered for. A viewer can be active across multiple
 * personas (e.g. TPO who's also a candidate); flags are independent.
 */
export function RecruitathonHeaderBar({
  driveSlug,
  driveTitle,
  registrationOpen,
  viewerStatus,
}: {
  driveSlug: string;
  driveTitle: string;
  registrationOpen: boolean;
  /**
   * Optional. When omitted (e.g. for signed-out viewers or pages
   * that haven't loaded the status), the bar defaults to the
   * register-as-X CTAs for all three personas.
   */
  viewerStatus?: RecruitathonViewerStatus;
}) {
  if (!registrationOpen) {
    // Render a slim "this fair is closed" notice instead so the
    // sub-header doesn't just disappear (would feel like a layout
    // bug to anyone who clicked through from an old share link).
    return (
      <div className="sticky top-14 z-20 border-b border-emce-border bg-emce-light-soft">
        <div className="container flex h-10 items-center text-xs text-emce-text-sec">
          Registration for <strong className="mx-1 text-emce-text">{driveTitle}</strong> is closed.
        </div>
      </div>
    );
  }

  // Resolve each CTA's destination + label based on viewer status.
  // Default = "Register as X" (for signed-out users and viewers who
  // haven't done X yet). Registered viewers see a one-click route
  // into the relevant dashboard / pass surface.
  const candidateCta = viewerStatus?.hasCandidateRegistration
    ? { href: `/me/fairs/${driveSlug}/pass`, label: "Fair pass", emoji: "🎫" }
    : { href: `/fairs/${driveSlug}/register?as=candidate`, label: "Candidate", emoji: "🎓" };

  const employerCta = viewerStatus?.hasEmployerParticipation
    ? { href: "/employer/fairs", label: "Manage booth", emoji: "🏢" }
    : { href: `/fairs/${driveSlug}/register?as=employer`, label: "Employer", emoji: "🏢" };

  const tpoCta = viewerStatus?.isTpoApproved
    ? { href: "/tpo", label: "TPO dashboard", emoji: "📋" }
    : viewerStatus?.hasTpoCell
    ? { href: `/fairs/${driveSlug}/registered?as=tpo`, label: "TPO status", emoji: "📋" }
    : { href: `/fairs/${driveSlug}/register?as=tpo`, label: "TPO", emoji: "📋" };

  return (
    <div className="sticky top-14 z-20 border-b border-emce-border bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="container flex h-12 items-center justify-between gap-3">
        <p className="hidden text-xs font-bold uppercase tracking-wider text-emce-mid-muted md:block">
          {viewerStatus &&
          (viewerStatus.hasCandidateRegistration ||
            viewerStatus.hasEmployerParticipation ||
            viewerStatus.hasTpoCell)
            ? `${driveTitle}`
            : `Register for ${driveTitle}`}
        </p>
        <p className="text-xs font-bold uppercase tracking-wider text-emce-mid-muted md:hidden">
          {driveTitle.split(" ").slice(0, 2).join(" ")}
        </p>
        {/* Three CTAs — same order as the hero so the visual rhythm
            matches. The primary (darkest) variant rotates onto the
            persona the viewer most likely "owns" (candidate if they
            have a registration, etc.) to give the active surface
            visual weight. Defaults to candidate for signed-out users. */}
        <nav aria-label="Recruitathon registration" className="flex items-center gap-1.5 sm:gap-2">
          <Link
            href={candidateCta.href}
            className={`inline-flex h-8 items-center rounded-md px-3 text-xs font-bold ${
              viewerStatus?.hasCandidateRegistration
                ? "bg-emce-dark text-white hover:bg-emce-darkest"
                : "border border-emce-mid bg-white text-emce-darkest hover:bg-emce-light-soft"
            }`}
          >
            {candidateCta.emoji} <span className="ml-1 hidden sm:inline">{candidateCta.label}</span>
          </Link>
          <Link
            href={employerCta.href}
            className={`inline-flex h-8 items-center rounded-md px-3 text-xs font-bold ${
              viewerStatus?.hasEmployerParticipation
                ? "bg-emce-dark text-white hover:bg-emce-darkest"
                : "border border-emce-mid bg-white text-emce-darkest hover:bg-emce-light-soft"
            }`}
          >
            {employerCta.emoji} <span className="ml-1 hidden sm:inline">{employerCta.label}</span>
          </Link>
          <Link
            href={tpoCta.href}
            className={`inline-flex h-8 items-center rounded-md px-3 text-xs font-bold ${
              viewerStatus?.hasTpoCell
                ? "bg-emce-dark text-white hover:bg-emce-darkest"
                : "border border-emce-mid bg-white text-emce-darkest hover:bg-emce-light-soft"
            }`}
          >
            {tpoCta.emoji} <span className="ml-1 hidden sm:inline">{tpoCta.label}</span>
          </Link>
        </nav>
      </div>
    </div>
  );
}
