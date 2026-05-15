import { openai, aiModels } from "@/lib/ai/openai";
import { trackAICall } from "@/lib/ai/track-cost";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * EV Cover Letter Generator. Takes a target role + company + the
 * candidate's free-text background, returns:
 *
 *   • A 300-400 word cover letter in the requested tone, formatted
 *     as plain paragraphs the candidate can paste into a form or
 *     email body. No "Dear Hiring Manager" boilerplate unless the
 *     candidate provided the manager's name.
 *
 *   • Three "customise next" pointers — short, specific tips for
 *     how to tighten the letter further (e.g. "open with the AIS-156
 *     compliance story since Ola talks about it on their site").
 *
 *   • A confidence flag we surface to the candidate when the input
 *     was thin enough that the letter is mostly generic. Tells them
 *     "add a project / metric / specific tool you've used" rather
 *     than letting them ship a vague letter without realising.
 */

export type CoverLetterTone =
  | "formal"
  | "enthusiastic"
  | "concise"
  | "warm"
  | "confident";

export interface CoverLetterInput {
  targetRole: string;
  targetCompany: string;
  /// Free-text paste of the candidate's experience / skills /
  /// projects. The model treats this as ground truth; if it's
  /// empty the result is generic.
  background: string;
  tone: CoverLetterTone;
  /// Optional hook the candidate wants the letter to open with —
  /// "I led the BMS firmware for our Formula Student EV", say.
  hook?: string | null;
  /// Optional hiring manager name. When omitted we open with the
  /// company name instead of a generic salutation.
  managerName?: string | null;
}

export interface CoverLetterResult {
  /// Cover letter body — paragraphs joined with blank lines. Already
  /// plain text; the candidate can paste it into a form or email
  /// client.
  body: string;
  /// 3 "customise next" tips, ordered by impact.
  customizationTips: string[];
  /// "high" = the AI had enough specific material to write a strong
  /// letter. "medium" = decent but could be sharper. "low" = the
  /// input was thin — surface a warning above the result.
  confidence: "low" | "medium" | "high";
}

const TONE_HINTS: Record<CoverLetterTone, string> = {
  formal:
    "Tone: formal and professional. Use full sentences, no contractions, no exclamation marks.",
  enthusiastic:
    "Tone: enthusiastic and energetic. Genuine excitement, but don't manufacture sentiment that isn't grounded in the candidate's background.",
  concise:
    "Tone: concise and direct. Short paragraphs. Lead with the most relevant project. Cut filler.",
  warm:
    "Tone: warm and human. Sound like a real person, not a template. Light use of personal phrasing is OK.",
  confident:
    "Tone: confident. State the candidate's strongest matches up-front. Avoid hedging language ('I think', 'I hope').",
};

export async function generateCoverLetter(input: CoverLetterInput): Promise<CoverLetterResult> {
  if (!env.OPENAI_API_KEY) return fallback();
  try {
    const completion = await trackAICall(
      { feature: "cover-letter", model: aiModels.parser },
      () =>
        openai.chat.completions.create({
          model: aiModels.parser,
          temperature: 0.6,
          response_format: { type: "json_object" },
          max_tokens: 1100,
          messages: [
            {
              role: "system",
              content: [
                `You are writing a cover letter for an EV-industry candidate applying for a ${input.targetRole} role at ${input.targetCompany}.`,
                TONE_HINTS[input.tone],
                input.hook
                  ? `The candidate wants to open with this angle: "${input.hook.trim().slice(0, 300)}". Build the first paragraph around it.`
                  : "Open with the candidate's strongest EV-specific match — a project, metric, or technology they've worked with that the role would value.",
                input.managerName
                  ? `Address the letter to "${input.managerName.trim().slice(0, 60)}". Use the name once at the top; don't repeat it.`
                  : `No hiring manager name was supplied — open with "Hello ${input.targetCompany} team," or similar; don't use "Dear Hiring Manager".`,
                "",
                "Return ONLY valid JSON matching this exact shape:",
                "{",
                '  "body": "the cover letter as plain text. 300-400 words. Paragraphs separated by a single blank line. No markdown, no bold, no bullet lists. End with a 1-line sign-off (no name — the candidate adds theirs).",',
                '  "customizationTips": ["3 short, specific tips for how the candidate can tighten this further — e.g. \\"open with the AIS-156 story since the JD mentions homologation\\""],',
                '  "confidence": "low" | "medium" | "high"',
                "}",
                "Rules:",
                "- Never invent specifics not in the candidate's background. If they didn't mention a metric, don't fabricate one.",
                "- Mention the company by name in the opening paragraph, NOT just the role.",
                "- Reference at least one EV-domain specific (battery / charging / motors / software / policy) — generic 'transferable skills' letters lose against domain-aware ones.",
                "- Confidence='low' when the background is fewer than ~30 specific words. Candidate sees a warning so they can re-run with more detail.",
              ]
                .filter(Boolean)
                .join("\n"),
            },
            {
              role: "user",
              content:
                "Candidate background:\n" +
                input.background.trim().slice(0, 4000),
            },
          ],
        }),
    );
    const raw = completion.choices[0]?.message?.content ?? "{}";
    return validate(JSON.parse(raw));
  } catch (err) {
    logger.warn({ err }, "[cover-letter] fell back");
    return fallback();
  }
}

function validate(raw: unknown): CoverLetterResult {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<CoverLetterResult>;
  return {
    body: String(r.body ?? "").slice(0, 4000).trim(),
    customizationTips: Array.isArray(r.customizationTips)
      ? r.customizationTips.slice(0, 5).map((t) => String(t).slice(0, 300))
      : [],
    confidence:
      r.confidence === "high" || r.confidence === "medium" || r.confidence === "low"
        ? r.confidence
        : "medium",
  };
}

function fallback(): CoverLetterResult {
  return {
    body:
      "AI cover-letter generation is disabled on this environment (OPENAI_API_KEY missing). The full tool produces a 300-400 word EV-tailored letter — try again on a deployment with AI enabled.",
    customizationTips: [],
    confidence: "low",
  };
}
