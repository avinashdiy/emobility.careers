import { openai, aiModels } from "@/lib/ai/openai";
import { trackAICall } from "@/lib/ai/track-cost";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * EV Career Path Advisor.
 *
 * Given where the candidate is today and where they want to be,
 * produces a 3-5 milestone roadmap walking them from "now" to
 * "target". Each milestone is concrete:
 *
 *   • Role title at that stage (what kind of position they'd hold)
 *   • Time window (years from today)
 *   • 3-4 skills / projects / certifications to acquire in that
 *     window
 *   • A "promotion signal" sentence — what they'd be doing that
 *     proves they're ready for the next step
 *   • Salary band (honest range, in INR LPA, India-only since
 *     that's the platform's market). Conservative — recruiters
 *     should not be able to use these as negotiation anchors.
 *
 * Also emits a one-paragraph north-star summary tying the path
 * back to where the EV industry itself is heading over that
 * horizon — battery localisation, charging-as-a-service, software-
 * defined vehicle, etc. — so the candidate sees the market context
 * alongside the personal plan.
 */

export interface CareerMilestone {
  /// Years from today this milestone targets. 0 = "now"; the model
  /// can return 0 for the first milestone (the candidate's current
  /// state) so the path reads as a baseline → +1yr → +3yr arc.
  yearsFromNow: number;
  title: string;
  description: string;
  skillsToAcquire: string[];
  promotionSignal: string;
  /// India INR Lakhs Per Annum range. Honest, conservative — used
  /// as a sanity-check, not a negotiation reference.
  salaryRangeLpaMin: number;
  salaryRangeLpaMax: number;
}

export interface CareerPathResult {
  /// 3-4 sentence north-star — where the candidate ends up + how
  /// the EV industry context informs the trajectory.
  northStarSummary: string;
  milestones: CareerMilestone[];
  /// 3-4 "watch out" items — common traps people fall into on
  /// this path that we want the candidate to know upfront.
  watchOuts: string[];
}

export interface CareerPathInput {
  /// Where they are today — free-text role + recent experience.
  currentSituation: string;
  /// Where they want to land — free-text role or capability.
  targetRole: string;
  /// Years from today to reach `targetRole`. Drives the milestone
  /// spacing.
  horizonYears: number;
  evDomainSlug?: string | null;
  /// Optional constraint — geography, family, willingness to
  /// relocate / switch industries / take a paycut. Helps the model
  /// avoid suggesting unrealistic moves.
  constraints?: string | null;
}

export async function generateCareerPath(input: CareerPathInput): Promise<CareerPathResult> {
  if (!env.OPENAI_API_KEY) return fallback();
  try {
    const completion = await trackAICall(
      { feature: "career-path", model: aiModels.parser },
      () =>
        openai.chat.completions.create({
          model: aiModels.parser,
          temperature: 0.3,
          response_format: { type: "json_object" },
          max_tokens: 1400,
          messages: [
            {
              role: "system",
              content: [
                "You are an EV-industry career advisor for the Indian market. Given a candidate's current state and target role, produce a 3-5 milestone roadmap with honest skill gaps + India INR-LPA salary signals.",
                `Target horizon: ${input.horizonYears} year${input.horizonYears === 1 ? "" : "s"}.`,
                input.evDomainSlug
                  ? `Anchor the path in the ${input.evDomainSlug.replace(/-/g, " ")} domain.`
                  : "Anchor the path across whichever EV-domain the candidate's current and target roles span.",
                input.constraints
                  ? `Constraints / preferences the candidate flagged: "${input.constraints.trim().slice(0, 400)}". Respect them — don't suggest a move that violates them.`
                  : "",
                "",
                "Return ONLY valid JSON matching this exact shape:",
                "{",
                '  "northStarSummary": "3-4 sentences — the destination + the EV-industry context that shapes the path",',
                '  "milestones": [',
                "    {",
                '      "yearsFromNow": 0 | 1 | 2 | 3 | 4 | 5 (etc),',
                '      "title": "concrete role / position label",',
                '      "description": "1-2 sentences — what they\'re doing day-to-day at this stage",',
                '      "skillsToAcquire": ["3-4 specific skills / projects / certifications to acquire BEFORE moving to the next milestone"],',
                '      "promotionSignal": "1 sentence — what they\'ll be doing that proves they\'re ready for the next stage",',
                '      "salaryRangeLpaMin": integer (in INR Lakhs Per Annum),',
                '      "salaryRangeLpaMax": integer',
                "    }",
                "  ],",
                '  "watchOuts": ["3-4 common traps on this specific path"]',
                "}",
                "Rules:",
                "- Return 3-5 milestones spanning the horizon. First milestone yearsFromNow = 0 (current state); last = horizonYears.",
                "- Salary bands conservative + India INR LPA. Mid-2026 market — a mid-level battery engineer is roughly 14-22 LPA, senior 22-40 LPA, lead 40-60+ LPA. Don't inflate.",
                "- 'skillsToAcquire' must be specific (named standards, certs, tools) — not generic 'leadership' / 'communication'.",
                "- 'promotionSignal' should be observable, not aspirational. e.g. 'leads a 3-person sub-team for a full development cycle', not 'demonstrates leadership'.",
                "- 'watchOuts' are SPECIFIC to this path — e.g. 'staying purely on simulation cuts you off from production roles after 4-5 years' rather than generic career advice.",
              ]
                .filter(Boolean)
                .join("\n"),
            },
            {
              role: "user",
              content:
                `Where I am today:\n${input.currentSituation.trim().slice(0, 1500)}\n\n` +
                `Where I want to be in ${input.horizonYears} year${input.horizonYears === 1 ? "" : "s"}:\n${input.targetRole.trim().slice(0, 400)}`,
            },
          ],
        }),
    );
    const raw = completion.choices[0]?.message?.content ?? "{}";
    return validate(JSON.parse(raw));
  } catch (err) {
    logger.warn({ err }, "[career-path] fell back");
    return fallback();
  }
}

function intOrZero(n: unknown): number {
  const v = Math.round(Number(n));
  return Number.isFinite(v) && v >= 0 ? v : 0;
}

function validate(raw: unknown): CareerPathResult {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<CareerPathResult>;
  const milestones: CareerMilestone[] = Array.isArray(r.milestones)
    ? r.milestones.slice(0, 6).map((m) => {
        const o = (m && typeof m === "object" ? m : {}) as Partial<CareerMilestone>;
        return {
          yearsFromNow: intOrZero(o.yearsFromNow),
          title: String(o.title ?? "").slice(0, 120) || "Milestone",
          description: String(o.description ?? "").slice(0, 400),
          skillsToAcquire: Array.isArray(o.skillsToAcquire)
            ? o.skillsToAcquire.slice(0, 6).map((s) => String(s).slice(0, 200))
            : [],
          promotionSignal: String(o.promotionSignal ?? "").slice(0, 300),
          salaryRangeLpaMin: intOrZero(o.salaryRangeLpaMin),
          salaryRangeLpaMax: intOrZero(o.salaryRangeLpaMax),
        };
      })
    : [];
  return {
    northStarSummary: String(r.northStarSummary ?? "").slice(0, 800),
    milestones,
    watchOuts: Array.isArray(r.watchOuts)
      ? r.watchOuts.slice(0, 5).map((w) => String(w).slice(0, 300))
      : [],
  };
}

function fallback(): CareerPathResult {
  return {
    northStarSummary:
      "AI career-path generation is disabled on this environment (OPENAI_API_KEY missing). Try again on a deployment with AI enabled.",
    milestones: [],
    watchOuts: [],
  };
}
