import { openai, aiModels } from "@/lib/ai/openai";
import { trackAICall } from "@/lib/ai/track-cost";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * "Analyze Your EV Skills" engine. Given a free-text or comma-
 * separated list of skills + optional EV-domain focus + seniority,
 * produces a structured gap analysis:
 *
 *   • 0-100 score per EV-domain pillar (battery / charging / motors /
 *     software / industry-context)
 *   • 3-5 prioritised "next skills to learn" with the reasoning
 *   • 3-5 "you're already strong here" recognitions so the result
 *     doesn't read as one-sided criticism
 *
 * Mirrors the shape of Roast Resume's result so the rendered card
 * UI can be shared.
 */

export interface SkillsCoverage {
  /// Battery cells, packs, BMS, thermals.
  battery: number;
  /// EVSE / OCPP / charging infrastructure.
  charging: number;
  /// Motors, drives, power electronics, controls.
  motorsAndPower: number;
  /// Embedded firmware, ECU software, telematics, vehicle networks.
  software: number;
  /// Policy, market, sustainability, EV-industry awareness.
  industryContext: number;
}

export interface SkillItem {
  title: string;
  body: string;
  severity: "low" | "medium" | "high";
}

export interface SkillsAnalysisResult {
  overall: number;
  coverage: SkillsCoverage;
  gaps: SkillItem[];
  strengths: SkillItem[];
  summary: string;
}

export interface SkillsAnalysisInput {
  rawSkills: string;
  /// EV-domain slug the candidate is targeting. Used to weight the
  /// score so a "battery engineer" with deep battery skills doesn't
  /// get penalised for thin charging coverage.
  evDomainSlug?: string | null;
  /// Seniority context — same set of strings as the job form.
  seniorityLevel?: string | null;
  /// Candidate's free-text career goal (1-2 lines). Helps the model
  /// tailor the "next skills" to where they want to go.
  careerGoal?: string | null;
}

export async function analyzeSkills(input: SkillsAnalysisInput): Promise<SkillsAnalysisResult> {
  if (!env.OPENAI_API_KEY) return fallback();

  const skillList = input.rawSkills
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (skillList.length === 0) {
    return {
      ...fallback(),
      summary: "Add at least a few skills to analyse — the model can't score an empty list.",
    };
  }

  try {
    const completion = await trackAICall(
      { feature: "skills-analyzer", model: aiModels.parser },
      () =>
        openai.chat.completions.create({
          model: aiModels.parser,
          temperature: 0.2,
          response_format: { type: "json_object" },
          max_tokens: 1100,
          messages: [
            {
              role: "system",
              content: [
                "You are an EV-industry hiring advisor evaluating a candidate's stated skill set against what India's EV employers actually hire for.",
                input.evDomainSlug
                  ? `The candidate is targeting the "${input.evDomainSlug.replace(/-/g, " ")}" domain — weight the coverage scores so depth in that area matters more than breadth.`
                  : "The candidate hasn't picked a domain — score evenly across pillars.",
                input.seniorityLevel
                  ? `They're targeting a ${input.seniorityLevel.toLowerCase()}-level role.`
                  : "",
                input.careerGoal
                  ? `Their stated career goal: "${input.careerGoal.trim().slice(0, 400)}"`
                  : "",
                "",
                "Return ONLY valid JSON matching this exact shape:",
                "{",
                '  "overall": 0-100 integer,',
                '  "coverage": { "battery": 0-100, "charging": 0-100, "motorsAndPower": 0-100, "software": 0-100, "industryContext": 0-100 },',
                '  "gaps": [{ "title": "short", "body": "one paragraph — what to learn, why it matters, how to start", "severity": "low" | "medium" | "high" }],',
                '  "strengths": [{ "title": "short", "body": "one paragraph — what they already have that\'s rare", "severity": "low" | "medium" | "high" }],',
                '  "summary": "2-3 sentence honest read on where they stand"',
                "}",
                "Rules:",
                "- Score conservatively. 'overall' 80+ requires demonstrably deep + relevant skills, not just a long list of keywords.",
                "- 3-5 gaps. Order by severity descending. Severity 'high' = blocks them from being shortlistable for the role they want.",
                "- 3-5 strengths. Don't manufacture compliments — if the list is genuinely thin, return 1-2 honest ones rather than padding.",
                "- 'body' must be specific to the skills they listed, not generic advice. Quote their own terms where you can.",
              ]
                .filter(Boolean)
                .join("\n"),
            },
            {
              role: "user",
              content: `Skills: ${skillList.join(", ")}`,
            },
          ],
        }),
    );
    const raw = completion.choices[0]?.message?.content ?? "{}";
    return validate(JSON.parse(raw));
  } catch (err) {
    logger.warn({ err }, "[skills-analyzer] fell back");
    return fallback();
  }
}

function clamp(n: unknown): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 50;
  return Math.max(0, Math.min(100, v));
}

function validate(raw: unknown): SkillsAnalysisResult {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<SkillsAnalysisResult>;
  const c = (r.coverage ?? {}) as Partial<SkillsCoverage>;
  const items = (arr: unknown, max: number): SkillItem[] =>
    Array.isArray(arr)
      ? arr.slice(0, max).map((x) => {
          const o = (x && typeof x === "object" ? x : {}) as Partial<SkillItem>;
          const sev = o.severity === "high" || o.severity === "medium" || o.severity === "low" ? o.severity : "medium";
          return {
            title: String(o.title ?? "").slice(0, 120) || "Note",
            body: String(o.body ?? "").slice(0, 600),
            severity: sev,
          };
        })
      : [];
  return {
    overall: clamp(r.overall),
    coverage: {
      battery: clamp(c.battery),
      charging: clamp(c.charging),
      motorsAndPower: clamp(c.motorsAndPower),
      software: clamp(c.software),
      industryContext: clamp(c.industryContext),
    },
    gaps: items(r.gaps, 5),
    strengths: items(r.strengths, 5),
    summary: String(r.summary ?? "").slice(0, 1000),
  };
}

function fallback(): SkillsAnalysisResult {
  return {
    overall: 50,
    coverage: {
      battery: 50,
      charging: 50,
      motorsAndPower: 50,
      software: 50,
      industryContext: 50,
    },
    gaps: [
      {
        title: "AI scoring unavailable",
        body:
          "OPENAI_API_KEY isn't configured on this environment so we couldn't grade your skill list. Try again on a deployment with AI enabled.",
        severity: "low",
      },
    ],
    strengths: [],
    summary: "Heuristic fallback — AI scoring is disabled on this environment.",
  };
}
