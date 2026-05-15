import { openai, aiModels } from "@/lib/ai/openai";
import { trackAICall } from "@/lib/ai/track-cost";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Expert CV Evaluation — deep section-by-section analysis.
 *
 * The shape difference vs Roast Resume:
 *   - Roast returns a single overall score + 3-5 fix items. Designed
 *     as a fast viral hook ("you scored 67/100"), 30 seconds end-to-
 *     end.
 *   - Expert Evaluation walks every common CV section (summary,
 *     experience, education, skills, projects, formatting) and
 *     emits per-section scores + observations + REWRITE suggestions
 *     for the weak bullets. Designed as the "I'm two weeks out from
 *     interviewing and I want a hard look" surface.
 *
 * Two paths:
 *   1. OpenAI: structured JSON schema response. Conservative scoring.
 *   2. Heuristic fallback: when OPENAI_API_KEY missing, returns a
 *      placeholder explaining the env is misconfigured.
 */

export interface CvSectionAnalysis {
  /// "Summary" / "Experience" / "Education" / "Skills" / "Projects" /
  /// "Formatting & readability". We don't pin to an enum so a future
  /// section can be added without a migration.
  section: string;
  /// 0-100 section score.
  score: number;
  /// 1-2 sentence honest read on the section as it stands.
  observation: string;
  /// 2-4 specific rewrite suggestions. Each item is a short
  /// "before → after" hint — the candidate can apply it directly.
  rewrites: string[];
}

export interface CvTopFix {
  title: string;
  body: string;
}

export interface CvEvaluationResult {
  overall: number;
  /// 5-7 section analyses, one per CV section.
  sections: CvSectionAnalysis[];
  /// The high-signal subset — if the candidate only has 30 minutes
  /// before their interview, fix these.
  topFixes: CvTopFix[];
  /// 3-4 sentence wrap-up the candidate can read first.
  summary: string;
}

export interface CvEvaluationInput {
  resumeText: string;
  targetRole?: string | null;
  evDomainSlug?: string | null;
}

export async function evaluateCv(input: CvEvaluationInput): Promise<CvEvaluationResult> {
  if (!env.OPENAI_API_KEY) return fallback();
  if (input.resumeText.trim().length < 200) {
    return {
      ...fallback(),
      summary:
        "The text we extracted from your CV is too short to evaluate (<200 characters). Re-upload a complete, multi-section PDF or DOCX.",
    };
  }
  try {
    const completion = await trackAICall(
      { feature: "cv-evaluation", model: aiModels.parser },
      () =>
        openai.chat.completions.create({
          model: aiModels.parser,
          temperature: 0.2,
          response_format: { type: "json_object" },
          max_tokens: 2000,
          messages: [
            {
              role: "system",
              content: [
                "You are a senior EV-industry recruiting partner evaluating a candidate's CV. Read every section. Produce per-section scores, observations, and SPECIFIC rewrite suggestions — not generic tips.",
                input.targetRole
                  ? `The candidate is targeting a "${input.targetRole}" role. Pitch your evaluation to that bar.`
                  : "The candidate hasn't told us a target role — evaluate against a generic EV-industry mid-level bar.",
                input.evDomainSlug
                  ? `Their target EV domain: "${input.evDomainSlug.replace(/-/g, " ")}". Weight section scores so depth in that area matters more than breadth.`
                  : "",
                "",
                "Return ONLY valid JSON matching this exact shape:",
                "{",
                '  "overall": 0-100 integer,',
                '  "sections": [',
                "    {",
                '      "section": "Summary" | "Experience" | "Education" | "Skills" | "Projects" | "Certifications" | "Formatting & readability",',
                '      "score": 0-100,',
                '      "observation": "1-2 sentences on this section as it stands — quote the candidate\'s phrasing where you can",',
                '      "rewrites": ["2-4 SPECIFIC rewrite suggestions. Format: short \\"weak phrasing → stronger phrasing\\" hints the candidate can apply directly. Quote actual lines from the resume."]',
                "    }",
                "  ],",
                '  "topFixes": [{ "title": "short", "body": "1-2 sentences — what to do, why it matters" }],',
                '  "summary": "3-4 sentence honest wrap-up the candidate can read first"',
                "}",
                "Rules:",
                "- 5-7 section entries. Skip sections that genuinely aren't in the CV (e.g. no Projects section ⇒ don't fabricate one), but call that out in topFixes if it's a real gap.",
                "- Score conservatively. 80+ requires demonstrably strong content. A typical mid-level CV scores 55-70.",
                "- Rewrites must quote the candidate's actual text. \"Quantify your impact\" is bad; \"Led BMS firmware → Led BMS firmware on a 7s4p Li-NMC pack, cutting cell-imbalance alerts by 40%\" is good.",
                "- topFixes = 3 items max, ordered by impact. These are the high-signal subset.",
              ]
                .filter(Boolean)
                .join("\n"),
            },
            {
              role: "user",
              content: input.resumeText.slice(0, 14000),
            },
          ],
        }),
    );
    const raw = completion.choices[0]?.message?.content ?? "{}";
    return validate(JSON.parse(raw));
  } catch (err) {
    logger.warn({ err }, "[cv-evaluation] fell back");
    return fallback();
  }
}

function clamp(n: unknown): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 50;
  return Math.max(0, Math.min(100, v));
}

function validate(raw: unknown): CvEvaluationResult {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<CvEvaluationResult>;
  return {
    overall: clamp(r.overall),
    sections: Array.isArray(r.sections)
      ? r.sections.slice(0, 8).map((s) => {
          const o = (s && typeof s === "object" ? s : {}) as Partial<CvSectionAnalysis>;
          return {
            section: String(o.section ?? "Section").slice(0, 80),
            score: clamp(o.score),
            observation: String(o.observation ?? "").slice(0, 600),
            rewrites: Array.isArray(o.rewrites)
              ? o.rewrites.slice(0, 6).map((x) => String(x).slice(0, 400))
              : [],
          };
        })
      : [],
    topFixes: Array.isArray(r.topFixes)
      ? r.topFixes.slice(0, 4).map((t) => {
          const o = (t && typeof t === "object" ? t : {}) as Partial<CvTopFix>;
          return {
            title: String(o.title ?? "").slice(0, 120) || "Fix",
            body: String(o.body ?? "").slice(0, 500),
          };
        })
      : [],
    summary: String(r.summary ?? "").slice(0, 1200),
  };
}

function fallback(): CvEvaluationResult {
  return {
    overall: 50,
    sections: [],
    topFixes: [],
    summary:
      "AI evaluation is disabled on this environment (OPENAI_API_KEY missing). Try again on a deployment with AI enabled.",
  };
}
