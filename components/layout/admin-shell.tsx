import Link from "next/link";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminSidebar } from "@/components/layout/AdminSidebar";
import { Logo } from "@/components/brand/Logo";

/**
 * WordPress-style admin layout:
 *   - fixed left sidebar with grouped navigation (Dashboard / People /
 *     Recruitment / Mentorship / Competitions / Content / Operations /
 *     Insights / Settings)
 *   - thin top admin bar with brand + site link + viewer chip + sign out
 *   - main content takes remaining width
 *
 * Each grouped section collapses on mobile into an off-canvas drawer using
 * the existing MobileNav primitive (rendered server-side as a flat list).
 */
export async function AdminShell({ children }: { children: React.ReactNode }) {
  const session = await auth();

  // Pending-queue counts so the sidebar can show WP-style red bubbles.
  const [
    pendingCompanies,
    pendingJobs,
    openReports,
    openPostReports,
    pendingIDVerifications,
    pendingMentors,
    pendingCompetitions,
    pendingDIYguru,
  ] = session?.user?.role === "ADMIN"
    ? await Promise.all([
        db.company.count({ where: { verificationStatus: "PENDING" } }),
        db.jobPosting.count({ where: { status: "PENDING_REVIEW" } }),
        db.jobReport.count({ where: { status: "OPEN" } }),
        // Post reports live in AuditLog (no dedicated schema yet — see
        // server/moderation/actions.ts → reportPost). Open ones have
        // meta.status == "OPEN"; the JSON-path filter below mirrors
        // /admin/post-reports.
        db.auditLog
          .count({
            where: {
              entity: "Post",
              action: "post.flagged",
              meta: { path: ["status"], equals: "OPEN" } as Prisma.JsonFilter,
            },
          })
          .catch(() => 0),
        // Twitter-style platform-issued ID verifications awaiting review.
        // Tracked here so admins see a red-bubble count next to the
        // sidebar entry the moment a candidate submits their Aadhar.
        db.candidateProfile.count({ where: { idVerificationStatus: "PENDING" } }),
        db.mentorProfile.count({ where: { kycStatus: "PENDING" } }),
        db.competition.count({ where: { status: "PENDING_REVIEW" } }),
        db.dIYguruRoster.count({ where: { claimedByUserId: null } }).catch(() => 0),
      ])
    : [0, 0, 0, 0, 0, 0, 0, 0];

  const totalPending =
    pendingCompanies +
    pendingJobs +
    openReports +
    openPostReports +
    pendingIDVerifications +
    pendingMentors +
    pendingCompetitions;

  return (
    <div className="min-h-screen bg-emce-light-bg">
      <header className="sticky top-0 z-30 border-b border-emce-border bg-emce-darkest text-white">
        <div className="flex h-12 items-center justify-between gap-3 px-4">
          {/* Brand wordmark on a white pill (header bg is dark teal so the
              dark-teal type inside the PNG would disappear without it) +
              an orange "Admin" pill so the chrome reads as the admin
              console rather than the public site. */}
          <Link href="/admin" className="flex items-center gap-2" aria-label="Admin home">
            <span className="rounded-md bg-white px-2 py-1">
              <Logo size="sm" priority />
            </span>
            <span className="hidden rounded-md bg-emce-orange px-2 py-0.5 text-xs font-extrabold text-white sm:inline">
              Admin
            </span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/" className="text-white/70 hover:text-white">Visit site →</Link>
            {session?.user && (
              <>
                <span className="hidden h-4 w-px bg-white/20 sm:block" />
                <span className="hidden text-white/70 sm:inline">{session.user.email}</span>
                <Link href="/api/auth/signout" className="rounded bg-white/10 px-2 py-1 text-xs font-bold hover:bg-white/20">
                  Sign out
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="flex">
        <AdminSidebar
          pendingCounts={{
            companies: pendingCompanies,
            jobs: pendingJobs,
            reports: openReports,
            postReports: openPostReports,
            idVerifications: pendingIDVerifications,
            mentors: pendingMentors,
            competitions: pendingCompetitions,
            diyguru: pendingDIYguru,
            total: totalPending,
          }}
        />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
