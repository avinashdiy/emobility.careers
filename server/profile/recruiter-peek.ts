import "server-only";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { dispatchNotification } from "@/lib/notifications/dispatch";

/**
 * #6 Privacy-preserving recruiter peek.
 *
 * Notify a candidate when a recruiter views their profile, with
 * ANONYMIZED company info instead of the recruiter's name. This
 * symmetrises the platform's information asymmetry — recruiters see
 * everything about candidates; candidates have historically seen
 * nothing about recruiters. The peek-notification gives candidates a
 * real-time "someone's looking at me" signal without violating the
 * recruiter's choice to remain unidentified at the discovery stage.
 *
 * Design-thinking rationale: candidates check the platform more
 * often when "people are looking at me" is a daily nudge. Recruiters
 * don't lose anything — they can still send a cold message, save
 * the candidate, or apply to a job which fully reveals them.
 *
 * Dedup contract: at most one notification per (recruiter, candidate)
 * pair per 7-day window. Without dedup, a recruiter scrolling back
 * and forth through search results would spam the candidate's bell.
 * groupKey + the existing notification-system's collapse-on-key
 * behaviour enforces this.
 */

const DEDUP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

interface PeekArgs {
  viewedUserId: string;
  viewerUserId: string;
}

export async function maybeNotifyRecruiterPeek({
  viewedUserId,
  viewerUserId,
}: PeekArgs): Promise<void> {
  try {
    if (viewedUserId === viewerUserId) return;

    // Honour the viewer's `viewerVisibility=ANONYMOUS` preference.
    // `trackProfileView` already drops the viewer's identity when
    // they've opted into anonymity (server/profile/views.ts:63);
    // we apply the same contract here so an anonymous-mode recruiter
    // also doesn't leak anonymised company info through the peek
    // notification. The candidate's ProfileView widget then shows
    // "Anonymous viewer" for the row — consistent semantics across
    // both surfaces.
    const viewerCandidateProfile = await db.candidateProfile.findUnique({
      where: { userId: viewerUserId },
      select: { viewerVisibility: true },
    });
    if (viewerCandidateProfile?.viewerVisibility === "ANONYMOUS") {
      return;
    }

    // Resolve the viewer's employer profile + company. If the viewer
    // isn't a recruiter, this is a no-op (regular candidate-side
    // viewing already flows through the existing profile-views
    // widget, no new notification needed).
    const employer = await db.employerProfile.findUnique({
      where: { userId: viewerUserId },
      select: {
        companyId: true,
        company: {
          select: {
            name: true,
            hqLocation: true,
            companyType: true,
            verificationStatus: true,
            // `team` is the EmployerProfile back-relation on Company;
            // counting it gives us a rough headcount band without
            // needing a Glassdoor-style company-size import.
            _count: { select: { team: true } },
          },
        },
      },
    });
    if (!employer || !employer.company) return;

    // Skip un-verified companies — un-verified accounts include
    // not-yet-KYC'd recruiters AND a few abuse signals. The
    // candidate's peek-notification should only fire from companies
    // the platform has at least nominally approved.
    if (employer.company.verificationStatus !== "VERIFIED") return;

    // Dedup: skip if we already notified this (recruiter, candidate)
    // pair within DEDUP_WINDOW_MS. Look for a recent notification
    // with the same groupKey — `recruiter-peek-<viewer>-<viewed>`.
    const groupKey = `recruiter-peek-${viewerUserId}-${viewedUserId}`;
    const recent = await db.notification.findFirst({
      where: {
        userId: viewedUserId,
        groupKey,
        createdAt: { gte: new Date(Date.now() - DEDUP_WINDOW_MS) },
      },
      select: { id: true },
    });
    if (recent) return;

    // Anonymized copy. Company-tier-style descriptor + city + a
    // crude employee-count band. The band uses _count on employer
    // profiles linked to the company — a proxy for headcount that's
    // ALREADY in our DB (no Glassdoor-style company-size import
    // needed). Bands chosen for India EV market shape:
    //   1 employer profile  → "an early-stage EV company"
    //   2–10                → "a small EV team"
    //   11–50               → "a mid-size EV company"
    //   50+                 → "an established EV company"
    const employerCount = employer.company._count.team;
    const sizeBand =
      employerCount <= 1
        ? "early-stage EV"
        : employerCount <= 10
          ? "small EV"
          : employerCount <= 50
            ? "mid-size EV"
            : "established EV";
    const sector = describeCompanyType(employer.company.companyType);
    // hqLocation is free-text ("Bangalore, India" / "Pune" / etc.).
    // We strip everything after the first comma to get a compact
    // city-shaped fragment for the headline.
    const where = employer.company.hqLocation
      ? ` in ${employer.company.hqLocation.split(",")[0].trim()}`
      : "";
    const headline = `Someone at a ${sizeBand}${sector} company${where} viewed your profile`;

    await dispatchNotification({
      userId: viewedUserId,
      type: "recruiter.peek",
      title: headline,
      body: "If they reach out, it'll be in your inbox. Update your profile while you're top-of-mind.",
      link: "/me/profile",
      channels: ["IN_APP"],
      groupKey,
    });
  } catch (err) {
    logger.warn(
      { err, viewedUserId, viewerUserId },
      "[recruiter-peek] notification failed",
    );
  }
}

/**
 * Map the existing CompanyType enum to a short prose descriptor for
 * the notification headline. Returns an empty string for null /
 * unrecognised values — the headline then drops the sector phrase
 * cleanly ("Someone at a mid-size EV company in Pune viewed your
 * profile") instead of awkwardly saying "OTHER company".
 */
function describeCompanyType(value: string | null | undefined): string {
  if (!value) return "";
  switch (value) {
    case "OEM": return "-OEM";
    case "TIER1": return "-Tier1 supplier";
    case "TIER2": return "-Tier2 supplier";
    case "BATTERY": return " battery";
    case "CHARGING": return " charging-infrastructure";
    case "FLEET": return " fleet/mobility";
    case "CONSULTING": return "-consulting";
    case "STARTUP": return "-startup";
    default: return "";
  }
}
