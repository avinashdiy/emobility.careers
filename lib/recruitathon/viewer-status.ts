import { db } from "@/lib/db";

/**
 * Snapshot of what the current viewer has already done for a given
 * recruitment drive. Powers the `RecruitathonHeaderBar`'s context-
 * aware CTAs so a candidate who's already registered sees "View
 * pass" instead of "Register as candidate" (which would just hit the
 * idempotent registration → welcome screen path anyway).
 *
 * Three independent boolean flags — a single viewer can be true on
 * multiple personas (e.g. a TPO who's also registered themselves as
 * a candidate at the same fair).
 */
export interface RecruitathonViewerStatus {
  hasCandidateRegistration: boolean;
  hasEmployerParticipation: boolean;
  /**
   * The viewer's CollegePlacementCell exists in any status (PENDING /
   * APPROVED / REJECTED / REVOKED). We surface a single TPO CTA
   * variant for all of them — the welcome screen handles the
   * status-specific copy.
   */
  hasTpoCell: boolean;
  /** Whether the viewer's TPO cell is APPROVED → can use the invite-link feature. */
  isTpoApproved: boolean;
}

const EMPTY_STATUS: RecruitathonViewerStatus = {
  hasCandidateRegistration: false,
  hasEmployerParticipation: false,
  hasTpoCell: false,
  isTpoApproved: false,
};

/**
 * Resolve the viewer status for (userId, driveId). Returns the empty
 * status object when userId is null (signed-out) — saves callers from
 * branching on null. Three parallel queries, all on indexed columns.
 */
export async function getRecruitathonViewerStatus(
  userId: string | null,
  driveId: string,
): Promise<RecruitathonViewerStatus> {
  if (!userId) return EMPTY_STATUS;

  const [candidateRow, employerRow, tpoCell] = await Promise.all([
    // Existing candidate registration for this drive.
    db.candidateProfile.findUnique({
      where: { userId },
      select: {
        fairRegistrations: {
          where: { driveId },
          select: { id: true },
          take: 1,
        },
      },
    }),
    // Employer participation = viewer's company has a row on this
    // drive. We don't surface "different employers" cases — most
    // users have at most one EmployerProfile so this covers ~all.
    db.employerProfile.findUnique({
      where: { userId },
      select: {
        company: {
          select: {
            recruitmentDriveParticipations: {
              where: { driveId },
              select: { id: true },
              take: 1,
            },
          },
        },
      },
    }),
    // TPO cell — any status. Drive-agnostic since a TPO's cell
    // applies across all fairs (one cell per institution-creator pair).
    db.collegePlacementCell.findFirst({
      where: { createdById: userId },
      select: { status: true },
    }),
  ]);

  return {
    hasCandidateRegistration: (candidateRow?.fairRegistrations.length ?? 0) > 0,
    hasEmployerParticipation:
      (employerRow?.company.recruitmentDriveParticipations.length ?? 0) > 0,
    hasTpoCell: !!tpoCell,
    isTpoApproved: tpoCell?.status === "APPROVED",
  };
}
