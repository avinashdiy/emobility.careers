import { openai, aiModels } from "@/lib/ai/openai";
import { logger } from "@/lib/logger";

/**
 * EV-specific Resume Roast scorer. Given the parsed text of a resume,
 * returns a 0-100 overall score, a per-dimension breakdown, and a
 * short list of actionable feedback items.
 *
 * Two paths:
 *
 *   1. **OpenAI path** — when OPENAI_API_KEY is set. We use a tightly
 *      structured prompt with a JSON schema response so the model
 *      can't drift. GPT-4o-mini at low temperature is enough for
 *      scoring; the rerank-sized model would be overkill.
 *
 *   2. **Heuristic fallback** — when OpenAI is unavailable (key
 *      missing, network blip). We score by counting EV-domain
 *      vocabulary against canonical keyword sets. Conservative but
 *      always works — important because the Roast page is a public,
 *      no-signup viral surface and a 5xx ruins the share.
 */

export interface RoastBreakdown {
  /** EV-domain depth — battery, charging, motors, software exposure. */
  evDepth: number;
  /** Industry experience clarity — companies + dates + titles legible. */
  experienceClarity: number;
  /** Project + achievement evidence — projects/papers/awards visible. */
  projectsImpact: number;
  /** Skills inventory + certifications signal. */
  skillsCertifications: number;
  /** Format / readability — section structure, length, spelling. */
  formatReadability: number;
}

export interface FeedbackItem {
  title: string;
  body: string;
  /** "low" / "medium" / "high" — drives colour + ordering on the result page. */
  severity: "low" | "medium" | "high";
}

export interface RoastResult {
  overall: number;
  breakdown: RoastBreakdown;
  feedback: FeedbackItem[];
}

const EV_KEYWORDS = {
  battery: ["battery", "bms", "cell", "lithium", "thermal", "pack", "ais-156", "li-ion"],
  charging: ["ocpp", "evse", "ccs", "chademo", "gb/t", "ac charger", "dc fast", "v2g"],
  motors: ["pmsm", "bldc", "foc", "inverter", "vector control", "motor controller", "regen", "sic", "gan"],
  software: ["embedded", "rtos", "autosar", "can bus", "mqtt", "matlab", "simulink", "ota", "telematics"],
  vehicle: ["chassis", "biw", "powertrain", "drivetrain", "vehicle integration", "homologation"],
  policy: ["fame", "pli", "lca", "carbon", "sustainability", "arai", "bis"],
};

function scoreHeuristic(text: string): RoastResult {
  const lower = text.toLowerCase();
  const allKeywords = Object.values(EV_KEYWORDS).flat();
  const hits = allKeywords.filter((k) => lower.includes(k)).length;
  const distinctDomains = Object.values(EV_KEYWORDS).filter((set) =>
    set.some((k) => lower.includes(k)),
  ).length;

  // EV depth — driven by number of distinct domains touched + density
  const evDepth = Math.min(100, distinctDomains * 12 + Math.min(40, hits * 2));

  // Experience clarity — looks for year ranges, "at <Company>", titles
  const yearRanges = (text.match(/\b(19|20)\d{2}\s*[-–—]\s*((19|20)\d{2}|present)\b/gi) ?? []).length;
  const titleHits = (text.match(/\b(engineer|manager|lead|architect|technician|intern|specialist|head of|director|vp|cto|ceo|founder)\b/gi) ?? []).length;
  const experienceClarity = Math.min(100, yearRanges * 18 + titleHits * 6);

  // Projects + impact — counts numbers (KPIs) and project keywords
  const numberHits = (text.match(/\b\d{2,3}%|\b\d+x\b|\b\d{1,3}(,\d{3})*\b/gi) ?? []).length;
  const projectKeywords = (text.match(/\b(project|capstone|prototype|hackathon|published|patent|awarded)\b/gi) ?? []).length;
  const projectsImpact = Math.min(100, projectKeywords * 14 + Math.min(40, numberHits * 2));

  // Skills + certifications
  const certHits = (text.match(/\b(certified|certification|certificate|coursera|udemy|nptel|diyguru)\b/gi) ?? []).length;
  const skillsCertifications = Math.min(100, hits * 5 + certHits * 12);

  // Format / readability — penalise extreme lengths, reward section markers
  const len = text.length;
  let formatReadability = 70;
  if (len < 800) formatReadability -= 30;
  if (len > 8000) formatReadability -= 15;
  const sectionHits = (text.match(/\b(experience|education|skills|projects|summary|certifications)\b/gi) ?? []).length;
  formatReadability += Math.min(30, sectionHits * 6);
  formatReadability = Math.max(0, Math.min(100, formatReadability));

  const breakdown: RoastBreakdown = {
    evDepth: Math.round(evDepth),
    experienceClarity: Math.round(experienceClarity),
    projectsImpact: Math.round(projectsImpact),
    skillsCertifications: Math.round(skillsCertifications),
    formatReadability: Math.round(formatReadability),
  };
  // Weighted overall — EV depth carries the most weight on this platform.
  const overall = Math.round(
    breakdown.evDepth * 0.35 +
      breakdown.experienceClarity * 0.2 +
      breakdown.projectsImpact * 0.2 +
      breakdown.skillsCertifications * 0.15 +
      breakdown.formatReadability * 0.1,
  );

  const feedback: FeedbackItem[] = [];
  if (breakdown.evDepth < 50) {
    feedback.push({
      severity: "high",
      title: "EV vocabulary is thin",
      body: "Recruiters scanning for EV roles look for specifics — battery chemistry, BMS, OCPP, FOC, AUTOSAR. Spell out the EV stack you've actually touched.",
    });
  }
  if (breakdown.experienceClarity < 60) {
    feedback.push({
      severity: "medium",
      title: "Experience timeline isn't crisp",
      body: "Add `Company · Title · YYYY-YYYY` rows for every role. Recruiters bounce in 6 seconds when they can't tell when you worked where.",
    });
  }
  if (breakdown.projectsImpact < 50) {
    feedback.push({
      severity: "medium",
      title: "No quantified impact",
      body: "Add 3 numbers: range increase %, cost reduction %, kWh saved, hours of test bench, anything. Numbers are the only thing that travels through 10 hops.",
    });
  }
  if (breakdown.skillsCertifications < 50) {
    feedback.push({
      severity: "low",
      title: "Skills section is bare",
      body: "List 8-12 EV-relevant skills in a clear block. NPTEL / DIYguru / Coursera certifications carry weight in India EV hiring — name them explicitly.",
    });
  }
  if (breakdown.formatReadability < 60) {
    feedback.push({
      severity: "low",
      title: "Readability needs work",
      body: text.length < 800
        ? "Resume is too short — recruiters expect 1-2 pages of substantive content."
        : text.length > 8000
        ? "Resume is too long — trim to 1-2 pages. Anything beyond that is rarely read."
        : "Add clear section headers: Summary · Experience · Projects · Education · Skills · Certifications.",
    });
  }
  if (feedback.length === 0) {
    feedback.push({
      severity: "low",
      title: "Solid baseline",
      body: "EV depth, experience clarity, and project signal are all strong. A targeted recruiter outreach + a Skill Compass card on LinkedIn would multiply the inbound.",
    });
  }
  return { overall, breakdown, feedback };
}

const SYSTEM_PROMPT = `You are an expert EV-industry recruiter scoring a candidate's resume for India's electric mobility job market. Score on five dimensions, each 0-100:

1. **evDepth** — Specific EV vocabulary, hands-on EV exposure, depth across battery / charging / motors / software / policy.
2. **experienceClarity** — Are companies + titles + dates legible at a glance?
3. **projectsImpact** — Quantified outcomes, projects, papers, hackathons.
4. **skillsCertifications** — Skill inventory + relevant certifications (NPTEL, DIYguru, Coursera, OEM).
5. **formatReadability** — Length, structure, section headers, spelling.

Then provide 3-5 specific, actionable feedback items. Each item has:
- title (under 8 words, punchy)
- body (1-2 sentences, specific advice)
- severity ("high" / "medium" / "low")

Reply with ONLY a JSON object, no prose:
{
  "evDepth": number, "experienceClarity": number, "projectsImpact": number,
  "skillsCertifications": number, "formatReadability": number,
  "feedback": [{ "title": string, "body": string, "severity": "high"|"medium"|"low" }]
}`;

export async function roastResume(text: string): Promise<RoastResult> {
  // Always have the heuristic ready — used when AI is off or fails, and
  // a sanity-check filter on the AI output.
  const heuristic = scoreHeuristic(text);

  if (!process.env.OPENAI_API_KEY || text.length < 200) {
    return heuristic;
  }

  try {
    // Trim before sending — protects token budget and prevents the model
    // from getting distracted by long, irrelevant tail content.
    const trimmed = text.length > 12000 ? text.slice(0, 12000) : text;
    const completion = await openai.chat.completions.create({
      model: aiModels.parser,
      response_format: { type: "json_object" },
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: trimmed },
      ],
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) return heuristic;
    const parsed = JSON.parse(raw) as Partial<RoastBreakdown> & { feedback?: FeedbackItem[] };

    // Defensive validation — clamp every score to 0..100, keep up to 5 feedback.
    const clamp = (n: unknown) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
    const breakdown: RoastBreakdown = {
      evDepth: clamp(parsed.evDepth),
      experienceClarity: clamp(parsed.experienceClarity),
      projectsImpact: clamp(parsed.projectsImpact),
      skillsCertifications: clamp(parsed.skillsCertifications),
      formatReadability: clamp(parsed.formatReadability),
    };
    const overall = Math.round(
      breakdown.evDepth * 0.35 +
        breakdown.experienceClarity * 0.2 +
        breakdown.projectsImpact * 0.2 +
        breakdown.skillsCertifications * 0.15 +
        breakdown.formatReadability * 0.1,
    );
    const feedback: FeedbackItem[] = (parsed.feedback ?? [])
      .slice(0, 5)
      .map((f) => ({
        title: String(f.title ?? "").slice(0, 80),
        body: String(f.body ?? "").slice(0, 600),
        severity: f.severity === "high" || f.severity === "medium" ? f.severity : "low",
      }));

    return {
      overall,
      breakdown,
      feedback: feedback.length > 0 ? feedback : heuristic.feedback,
    };
  } catch (err) {
    logger.warn({ err }, "[roast] AI scoring failed, falling back to heuristic");
    return heuristic;
  }
}
