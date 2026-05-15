import { openai, aiModels } from "@/lib/ai/openai";
import { trackAICall } from "@/lib/ai/track-cost";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * LinkedIn Profile Optimizer for EV-industry candidates.
 *
 * Inputs: the candidate's current LinkedIn headline + About section
 * + free-text experience summary + the target role they want
 * recruiters to think of them for.
 *
 * Outputs:
 *
 *   • 3 alternative headlines, each ≤ 220 chars (LinkedIn's limit),
 *     tuned to surface the EV-domain keywords recruiters search.
 *   • A rewritten "About" section in the target tone — 4-6
 *     paragraphs, no clichés ("results-driven professional", etc.),
 *     anchored in the candidate's actual material.
 *   • A list of 5-8 EV-domain keywords the profile is missing that
 *     would lift it in recruiter searches.
 *   • 3-5 specific section gaps ("add a Featured project pinning
 *     your BMS firmware paper", "skill list is missing CAN bus —
 *     add it", etc.).
 *   • A 0-100 overall optimisation score so the candidate can run
 *     it again after edits and see the bar move.
 */

export interface LinkedInHeadline {
  text: string;
  /// Why this headline works — one sentence, tied to recruiter
  /// search behaviour.
  reasoning: string;
}

export interface LinkedInGap {
  title: string;
  body: string;
  severity: "low" | "medium" | "high";
}

export interface LinkedInOptimizerResult {
  overallScore: number;
  /// 1-sentence snapshot the candidate can show their mentor.
  summary: string;
  headlines: LinkedInHeadline[];
  aboutRewrite: string;
  missingKeywords: string[];
  gaps: LinkedInGap[];
}

export interface LinkedInOptimizerInput {
  currentHeadline: string;
  currentAbout: string;
  experienceSummary: string;
  targetRole: string;
  evDomainSlug?: string | null;
}

export async function optimizeLinkedIn(input: LinkedInOptimizerInput): Promise<LinkedInOptimizerResult> {
  if (!env.OPENAI_API_KEY) return fallback();
  try {
    const completion = await trackAICall(
      { feature: "linkedin-optimizer", model: aiModels.parser },
      () =>
        openai.chat.completions.create({
          model: aiModels.parser,
          temperature: 0.4,
          response_format: { type: "json_object" },
          max_tokens: 1500,
          messages: [
            {
              role: "system",
              content: [
                `You are a LinkedIn profile editor specialising in India's EV-industry hiring. The candidate wants to be searchable + credible for a "${input.targetRole}" role.`,
                input.evDomainSlug
                  ? `Anchor the rewrites in the ${input.evDomainSlug.replace(/-/g, " ")} domain. Use the EV vocabulary recruiters in that domain actually search.`
                  : "Use general EV-industry vocabulary — battery, charging, motors, software, policy — appropriate to the target role.",
                "",
                "Return ONLY valid JSON matching this exact shape:",
                "{",
                '  "overallScore": 0-100 integer (current profile score, before applying your suggestions),',
                '  "summary": "1 sentence honest read on the current profile",',
                '  "headlines": [{ "text": "≤220 chars, no emojis, no symbols beyond | and ·", "reasoning": "1 sentence on why this headline works" }],',
                '  "aboutRewrite": "rewritten About section — 4-6 paragraphs, plain text, no markdown. Anchored in the candidate\'s actual material; no fabricated metrics. Open with a specific hook, not a generic claim.",',
                '  "missingKeywords": ["5-8 EV-domain keywords / phrases / standards the profile should contain for recruiter searches"],',
                '  "gaps": [{ "title": "short", "body": "1-2 sentences — what to add, where, why it lifts the profile", "severity": "low" | "medium" | "high" }]',
                "}",
                "Rules:",
                "- 3 headlines. Each must be distinct in angle (e.g. 'role-first', 'achievement-first', 'mission-first'). Stay ≤220 chars.",
                "- Never invent specific metrics, employer names, certifications, or projects. The rewrite must lean on what the candidate told you.",
                "- Cliché purge: 'passionate about', 'results-driven', 'team player', 'detail-oriented', 'leverage' — strip these from rewrites.",
                "- 'gaps' is 3-5 items, ordered by severity. 'high' = blocks recruiter shortlisting; 'low' = nice polish.",
                "- 'overallScore' should reflect the EXISTING profile, NOT the version after your edits. A profile with a strong headline but empty About is maybe 40; a profile with a weak headline AND empty About is 25.",
              ]
                .filter(Boolean)
                .join("\n"),
            },
            {
              role: "user",
              content:
                "Current headline:\n" +
                input.currentHeadline.trim().slice(0, 400) +
                "\n\nCurrent About section:\n" +
                (input.currentAbout.trim().slice(0, 3000) || "(empty)") +
                "\n\nExperience summary the candidate gave us:\n" +
                input.experienceSummary.trim().slice(0, 3000),
            },
          ],
        }),
    );
    const raw = completion.choices[0]?.message?.content ?? "{}";
    return validate(JSON.parse(raw));
  } catch (err) {
    logger.warn({ err }, "[linkedin-optimizer] fell back");
    return fallback();
  }
}

function clamp(n: unknown): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 50;
  return Math.max(0, Math.min(100, v));
}

function validate(raw: unknown): LinkedInOptimizerResult {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<LinkedInOptimizerResult>;
  return {
    overallScore: clamp(r.overallScore),
    summary: String(r.summary ?? "").slice(0, 400),
    headlines: Array.isArray(r.headlines)
      ? r.headlines.slice(0, 5).map((h) => {
          const o = (h && typeof h === "object" ? h : {}) as Partial<LinkedInHeadline>;
          return {
            text: String(o.text ?? "").slice(0, 220),
            reasoning: String(o.reasoning ?? "").slice(0, 300),
          };
        })
      : [],
    aboutRewrite: String(r.aboutRewrite ?? "").slice(0, 5000),
    missingKeywords: Array.isArray(r.missingKeywords)
      ? r.missingKeywords.slice(0, 10).map((k) => String(k).slice(0, 80))
      : [],
    gaps: Array.isArray(r.gaps)
      ? r.gaps.slice(0, 6).map((g) => {
          const o = (g && typeof g === "object" ? g : {}) as Partial<LinkedInGap>;
          const sev = o.severity === "high" || o.severity === "medium" || o.severity === "low" ? o.severity : "medium";
          return {
            title: String(o.title ?? "").slice(0, 120) || "Gap",
            body: String(o.body ?? "").slice(0, 400),
            severity: sev,
          };
        })
      : [],
  };
}

function fallback(): LinkedInOptimizerResult {
  return {
    overallScore: 50,
    summary:
      "AI optimisation is disabled on this environment (OPENAI_API_KEY missing).",
    headlines: [],
    aboutRewrite: "",
    missingKeywords: [],
    gaps: [],
  };
}
