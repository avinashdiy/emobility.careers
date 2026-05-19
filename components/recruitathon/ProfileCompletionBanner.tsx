import Link from "next/link";
import { Card } from "@/components/ui/card";
import {
  evaluateProfile,
  nextSteps,
  COMPLETENESS_THRESHOLDS,
  type CompletenessResult,
} from "@/lib/profile-completeness";

/**
 * Reusable profile-completion nudge banner. Renders the candidate's
 * current completeness gauge + the 3 cheapest sections still
 * outstanding as click-through CTAs.
 *
 * Two render modes:
 *   • `variant="welcome"` — used on /fairs/[slug]/registered right
 *     after inline-signup. Highlights "what's next" with friendly
 *     framing ("60% of the way to your full profile").
 *   • `variant="dashboard"` — slimmer card for /me banner reuse.
 *
 * Both share the same data shape so a future /me dashboard banner can
 * import this without duplication. Both also hide themselves when
 * the profile is already at ≥ 90% — nothing useful left to nudge.
 */
export function ProfileCompletionBanner({
  result,
  variant = "dashboard",
}: {
  result: CompletenessResult;
  variant?: "welcome" | "dashboard";
}) {
  // 90% is the "everything that matters is filled" mark — nudging
  // beyond that produces diminishing returns + reads as nagging.
  if (result.pct >= 90) return null;

  const steps = nextSteps(result, 3);
  if (steps.length === 0) return null;

  const tone =
    result.pct >= COMPLETENESS_THRESHOLDS.APPLY ? "ok"
    : result.pct >= COMPLETENESS_THRESHOLDS.EXPLORE ? "warn"
    : "primary";

  const barClass =
    tone === "ok" ? "bg-emce-mid"
    : tone === "warn" ? "bg-emce-amber"
    : "bg-emce-dark";

  return (
    <Card className={variant === "welcome" ? "border-emce-mid bg-emce-light-soft p-5" : "p-4"}>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-section text-emce-text">
            {variant === "welcome"
              ? `You're ${result.pct}% of the way to your full profile`
              : "Complete your profile"}
          </h3>
          <p className="mt-0.5 text-hint text-emce-text-sec">
            {variant === "welcome"
              ? "Each step below takes 1–3 minutes. Recruiters can find + contact you the moment you cross 60%."
              : "Recruiters prioritise complete profiles. Three quick wins below:"}
          </p>
        </div>
        <span className="text-xl font-extrabold tabular-nums text-emce-text">{result.pct}%</span>
      </div>

      {/* Progress bar — visual reinforcement of the percentage. */}
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-emce-border">
        <div
          className={`h-full transition-all ${barClass}`}
          style={{ width: `${result.pct}%` }}
          aria-hidden="true"
        />
      </div>

      <ul className="mt-4 space-y-2">
        {steps.map((s) => (
          <li key={s.id}>
            <Link
              href={s.href}
              className="flex items-center justify-between rounded-md border border-emce-border bg-white p-3 transition hover:border-emce-mid hover:bg-emce-light-soft"
            >
              <div className="flex items-center gap-3">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-emce-light-soft text-xs font-bold text-emce-dark">
                  +{s.weight}%
                </span>
                <span className="text-sm font-bold text-emce-text">{s.label}</span>
              </div>
              <span className="text-xs font-bold text-emce-dark">Go →</span>
            </Link>
          </li>
        ))}
      </ul>

      {variant === "welcome" && (
        <p className="mt-3 text-hint text-emce-text-sec">
          Tip: completing all three above usually takes 5–8 minutes total and
          unlocks job applications + recruiter messaging immediately.
        </p>
      )}
    </Card>
  );
}

/**
 * Server-side helper that loads the candidate's profile in the right
 * shape and runs `evaluateProfile` — saves every consumer from
 * re-doing the join. Pass the userId; returns null when there's no
 * CandidateProfile (e.g. employer-only account).
 */
export async function getCompletenessForUser(
  userId: string,
): Promise<CompletenessResult | null> {
  const { db } = await import("@/lib/db");
  const profile = await db.candidateProfile.findUnique({
    where: { userId },
    select: {
      headline: true,
      summary: true,
      profilePhotoUrl: true,
      location: true,
      noticePeriodDays: true,
      expectedCtcMin: true,
      resumeUrl: true,
      aiResumeUrl: true,
      useAiResume: true,
      languagesSpoken: true,
      preferredCities: true,
      evDomains: { select: { evDomainId: true } },
      skills: { select: { skillId: true } },
      experiences: { select: { id: true } },
      education: { select: { id: true } },
      certifications: { select: { id: true } },
      projects: { select: { id: true } },
    },
  });
  if (!profile) return null;
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { emailVerifiedAt: true, phoneVerifiedAt: true },
  });
  return evaluateProfile(profile, {
    emailVerified: !!user?.emailVerifiedAt,
    phoneVerified: !!user?.phoneVerifiedAt,
  });
}
