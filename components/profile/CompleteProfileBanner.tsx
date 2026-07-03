import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { COMPLETENESS_THRESHOLDS } from "@/lib/profile-completeness";

/**
 * Sticky reminder strip rendered just under the site header for every
 * authenticated CANDIDATE whose profile is below the apply threshold.
 *
 * Two states:
 *   - Below 50% (EXPLORE): "Your profile is X%. Reach 50% to start exploring."
 *   - 50–89%: "Your profile is X%. Reach 90% to apply for jobs."
 *
 * Hidden for ≥90%, for non-candidates, for admins, and on auth/onboarding/
 * verify routes (where the user is already in a focused flow). The
 * `pathname` is read from the `x-pathname` header set by middleware.ts so
 * this component stays a server component (no client JS, zero CLS).
 */
const HIDE_ON_PATHS = [
  "/onboarding",
  "/recruitathon", // the Recruitathon flow has NO 50% gate — the banner is
                   // confusing there (and covers the test UI on mobile)
  "/signin",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/me/profile", // already in the editor — banner would be noise
  "/admin",
  "/employer",
  "/403",
  "/404",
];

export async function CompleteProfileBanner() {
  // Read pathname from the header set by middleware.ts so we can decide
  // whether the banner belongs on this route without a useRouter hook.
  const h = await headers();
  const pathname = h.get("x-pathname") ?? "";
  if (HIDE_ON_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return null;
  }

  const session = await auth();
  if (!session?.user || session.user.role !== "CANDIDATE") return null;

  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
    select: { profileCompleteness: true, slug: true },
  });
  if (!profile) return null;
  const pct = profile.profileCompleteness;

  if (pct >= COMPLETENESS_THRESHOLDS.APPLY) return null;

  const belowExplore = pct < COMPLETENESS_THRESHOLDS.EXPLORE;
  const headline = belowExplore
    ? `Your profile is only ${pct}% complete — reach ${COMPLETENESS_THRESHOLDS.EXPLORE}% to start exploring.`
    : `Your profile is ${pct}% complete — reach ${COMPLETENESS_THRESHOLDS.APPLY}% to apply for jobs.`;

  // LinkedIn-style soft prompt: thin coloured top border + cream-tinted
  // bg. The prior loud red/amber filled banner was alarmist for what is
  // ordinary onboarding nudge UX.
  const accent = belowExplore ? "border-t-emce-red" : "border-t-emce-orange";
  const ctaTone = belowExplore
    ? "bg-emce-red text-white hover:bg-emce-red/90"
    : "bg-emce-orange text-white hover:bg-emce-orange/90";

  return (
    <div className={`border-b border-emce-border border-t-2 bg-emce-light-bg ${accent}`} role="status">
      <div className="container flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span aria-hidden="true" className="text-base">
            {belowExplore ? "👋" : "📝"}
          </span>
          <p className="text-emce-text">
            <span className="font-bold">{headline}</span>
          </p>
          {pct > 0 && (
            <span aria-hidden="true" className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-emce-border sm:inline-block">
              <span
                className={`block h-full rounded-full ${belowExplore ? "bg-emce-red" : "bg-emce-orange"}`}
                style={{ width: `${pct}%` }}
              />
            </span>
          )}
        </div>
        <Link
          href="/me/profile?from=banner"
          className={`inline-flex flex-shrink-0 items-center gap-1 rounded-md px-3 py-1 text-xs font-bold ${ctaTone}`}
        >
          Complete profile →
        </Link>
      </div>
    </div>
  );
}
