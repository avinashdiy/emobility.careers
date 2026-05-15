import { openai, aiModels } from "@/lib/ai/openai";
import { trackAICall } from "@/lib/ai/track-cost";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * AI Interview Engine — drives two candidate-facing tools:
 *
 *   • "Embedded Mock Interview" (`kind: MOCK`) — open-ended practice.
 *     Candidate picks a target role + seniority + optional EV domain
 *     and the AI plays a generic interviewer asking 6-8 questions
 *     across technical and behavioural buckets.
 *
 *   • "EV Interview Simulator" (`kind: SIMULATOR`) — scenario role-
 *     play. Same engine but the AI adopts a named interviewer
 *     persona at a specific EV company. Questions skew toward how
 *     that company actually hires (battery PnL at Ola, charging
 *     standards at Tata, controls at Ather, etc.).
 *
 * Both flows share the same three engine calls:
 *   1. `openingQuestion()` — first AI turn after session creation.
 *   2. `nextTurn()` — given the running transcript, get the next AI
 *      message. Returns the message AND a `done` flag: when the AI
 *      decides the interview has covered enough ground (~6-8
 *      questions) it sets `done: true` and the UI shows an "End
 *      session for feedback" CTA.
 *   3. `summarise()` — runs once at session end. Produces a 0-100
 *      score, a 5-axis breakdown, and 3-5 feedback items in the
 *      same shape as Roast Resume so the existing result card UI
 *      can render both side-by-side.
 *
 * Heuristic fallback: when OPENAI_API_KEY is missing, every method
 * returns a graceful canned response instead of throwing. This
 * keeps the tool reachable in dev without OpenAI keys; production
 * always has a key set.
 */

export type InterviewKind = "MOCK" | "SIMULATOR";

export interface InterviewTurn {
  role: "user" | "assistant";
  content: string;
  ts: string;
}

export interface InterviewSessionContext {
  kind: InterviewKind;
  targetRole: string;
  seniorityLevel: string;
  evDomainSlug?: string | null;
  targetCompany?: string | null;
  interviewerPersona?: string | null;
}

export interface InterviewBreakdown {
  /// Technical depth in the EV domain the candidate is targeting.
  technicalDepth: number;
  /// Communication clarity — did answers land cleanly?
  communicationClarity: number;
  /// Structured thinking (STAR, problem-solving frameworks).
  structuredThinking: number;
  /// EV-industry awareness — policy, market, key players.
  evIndustryAwareness: number;
  /// Behavioural fit — ownership, collaboration, growth mindset.
  behaviouralFit: number;
}

export interface InterviewFeedbackItem {
  title: string;
  body: string;
  severity: "low" | "medium" | "high";
}

export interface InterviewSummary {
  overall: number;
  breakdown: InterviewBreakdown;
  feedback: InterviewFeedbackItem[];
  summary: string;
}

/**
 * Recommended target turn count. The AI is told to wrap around this
 * many user turns; the client-side hint nudges the UI when to surface
 * the "End for feedback" CTA.
 */
export const TARGET_TURNS = 7;

function systemPrompt(ctx: InterviewSessionContext): string {
  const domainHint = ctx.evDomainSlug
    ? `Focus questions on the ${ctx.evDomainSlug.replace(/-/g, " ")} domain.`
    : "Mix battery, charging, motor-controls, and EV software topics.";

  if (ctx.kind === "SIMULATOR") {
    const persona = ctx.interviewerPersona || "experienced engineering manager";
    const company = ctx.targetCompany || "an Indian EV OEM";
    return [
      `You are role-playing as a ${persona} at ${company}, conducting a real interview for a ${ctx.seniorityLevel.toLowerCase()}-level ${ctx.targetRole} role.`,
      `Stay in character — refer to ${company}'s actual products, hiring bar, and engineering culture where you can.`,
      `Mix 2-3 technical questions specific to the role with 2-3 behavioural / motivation questions. ${domainHint}`,
      `Ask ONE question per turn. After the candidate answers, briefly acknowledge (one sentence) and ask the next question. Don't dump multiple questions at once.`,
      `Adapt difficulty to the candidate's answers: if they're nailing it, escalate; if they're struggling, simplify and probe gently.`,
      `Aim to cover roughly ${TARGET_TURNS} questions before suggesting the candidate wrap up. When you think the interview has covered enough ground, end your reply with the literal marker [INTERVIEW_DONE] on its own line. The UI will use that marker to surface a "Get my feedback" CTA — do NOT explain the marker to the candidate.`,
      `Never give the candidate the answer mid-interview. Save all feedback for the post-interview summary the system will request separately.`,
    ].join("\n");
  }

  return [
    `You are an experienced EV-industry interviewer running a mock interview for a ${ctx.seniorityLevel.toLowerCase()}-level ${ctx.targetRole} role.`,
    `Your goal is to help the candidate practice — push hard enough to surface gaps, but stay constructive in tone.`,
    `Mix 3-4 technical questions with 2-3 behavioural / motivation questions. ${domainHint}`,
    `Ask ONE question per turn. After each answer, give a one-sentence acknowledgement then ask the next question. Don't dump multiple questions at once.`,
    `Adapt difficulty to the candidate's answers: if they're nailing it, escalate; if they're struggling, simplify and probe gently.`,
    `Aim to cover roughly ${TARGET_TURNS} questions before suggesting they wrap up. When you've covered enough ground, end your reply with the literal marker [INTERVIEW_DONE] on its own line. The UI uses that marker to surface a "Get my feedback" CTA — do NOT explain the marker to the candidate.`,
    `Never give the candidate the answer mid-interview. Save all feedback for the post-interview summary the system will request separately.`,
  ].join("\n");
}

/**
 * Strip the `[INTERVIEW_DONE]` sentinel from a message before showing
 * it to the candidate, AND signal "done" to the caller. Lives on a
 * separate line per the prompt; the regex tolerates whitespace +
 * optional markdown emphasis the model occasionally adds.
 */
function extractDoneMarker(content: string): { content: string; done: boolean } {
  const re = /\n?\s*\*{0,2}\[INTERVIEW_DONE\]\*{0,2}\s*$/i;
  if (re.test(content)) {
    return { content: content.replace(re, "").trim(), done: true };
  }
  return { content: content.trim(), done: false };
}

/**
 * First AI message in a fresh session. The system prompt + a one-
 * line "begin" cue produce a warm, in-character opener.
 */
export async function openingQuestion(
  ctx: InterviewSessionContext,
): Promise<{ content: string; done: boolean }> {
  if (!env.OPENAI_API_KEY) return fallbackOpening(ctx);
  try {
    const completion = await trackAICall(
      { feature: "interview.opening", model: aiModels.parser },
      () =>
        openai.chat.completions.create({
          model: aiModels.parser,
          temperature: 0.7,
          max_tokens: 220,
          messages: [
            { role: "system", content: systemPrompt(ctx) },
            {
              role: "user",
              content:
                "[SYSTEM: begin the interview now. Greet the candidate in one sentence and ask your first question.]",
            },
          ],
        }),
    );
    const text = completion.choices[0]?.message?.content ?? "";
    return extractDoneMarker(text || fallbackOpening(ctx).content);
  } catch (err) {
    logger.warn({ err }, "[interview] openingQuestion fell back");
    return fallbackOpening(ctx);
  }
}

/**
 * Next interviewer turn given the running transcript. The transcript
 * is fed as alternating user / assistant messages; the system prompt
 * stays in front. Returns the model's reply minus the done marker
 * plus the `done` flag for the UI.
 */
export async function nextTurn(
  ctx: InterviewSessionContext,
  history: InterviewTurn[],
): Promise<{ content: string; done: boolean }> {
  if (!env.OPENAI_API_KEY) return fallbackNext(ctx, history);
  try {
    const completion = await trackAICall(
      { feature: "interview.turn", model: aiModels.parser },
      () =>
        openai.chat.completions.create({
          model: aiModels.parser,
          temperature: 0.7,
          max_tokens: 280,
          messages: [
            { role: "system", content: systemPrompt(ctx) },
            ...history.map((t) => ({ role: t.role, content: t.content })),
          ],
        }),
    );
    const text = completion.choices[0]?.message?.content ?? "";
    return extractDoneMarker(text || fallbackNext(ctx, history).content);
  } catch (err) {
    logger.warn({ err }, "[interview] nextTurn fell back");
    return fallbackNext(ctx, history);
  }
}

/**
 * Post-session summariser. Produces a 0-100 overall score, the 5-
 * axis breakdown, and 3-5 feedback items. Strict JSON-schema output
 * so the result card UI can render it without runtime guards.
 */
export async function summarise(
  ctx: InterviewSessionContext,
  history: InterviewTurn[],
): Promise<InterviewSummary> {
  if (!env.OPENAI_API_KEY) return fallbackSummary();
  try {
    const transcript = history
      .map((t) => `${t.role === "user" ? "Candidate" : "Interviewer"}: ${t.content}`)
      .join("\n\n");
    const completion = await trackAICall(
      { feature: "interview.summary", model: aiModels.parser },
      () =>
        openai.chat.completions.create({
          model: aiModels.parser,
          temperature: 0.2,
          response_format: { type: "json_object" },
          max_tokens: 800,
          messages: [
            {
              role: "system",
              content: [
                `You are evaluating a mock interview transcript. The candidate was practising for a ${ctx.seniorityLevel.toLowerCase()}-level ${ctx.targetRole} role${ctx.targetCompany ? ` at ${ctx.targetCompany}` : ""}.`,
                "Return ONLY valid JSON matching this shape:",
                "{",
                '  "overall": 0-100 integer,',
                '  "breakdown": { "technicalDepth": 0-100, "communicationClarity": 0-100, "structuredThinking": 0-100, "evIndustryAwareness": 0-100, "behaviouralFit": 0-100 },',
                '  "feedback": [{ "title": "short", "body": "one paragraph, actionable", "severity": "low" | "medium" | "high" }],',
                '  "summary": "3-4 sentence wrap-up the candidate can read first"',
                "}",
                "Score conservatively — a candidate who skipped questions or gave vague answers should not score above 60. Reserve 80+ for genuinely strong performance.",
                "Feedback items should be specific to THIS transcript — quote the candidate's own phrasing where possible. 3 items minimum, 5 maximum, ordered by severity (high first).",
              ].join("\n"),
            },
            { role: "user", content: transcript },
          ],
        }),
    );
    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as InterviewSummary;
    return validateSummary(parsed);
  } catch (err) {
    logger.warn({ err }, "[interview] summarise fell back");
    return fallbackSummary();
  }
}

function validateSummary(s: Partial<InterviewSummary> | null): InterviewSummary {
  const clamp = (n: unknown) => {
    const v = Math.round(Number(n));
    if (!Number.isFinite(v)) return 50;
    return Math.max(0, Math.min(100, v));
  };
  const b = (s?.breakdown ?? {}) as Partial<InterviewBreakdown>;
  return {
    overall: clamp(s?.overall),
    breakdown: {
      technicalDepth: clamp(b.technicalDepth),
      communicationClarity: clamp(b.communicationClarity),
      structuredThinking: clamp(b.structuredThinking),
      evIndustryAwareness: clamp(b.evIndustryAwareness),
      behaviouralFit: clamp(b.behaviouralFit),
    },
    feedback: Array.isArray(s?.feedback)
      ? s!.feedback!.slice(0, 5).map((f) => ({
          title: String(f.title ?? "Note").slice(0, 120),
          body: String(f.body ?? "").slice(0, 600),
          severity:
            f.severity === "high" || f.severity === "medium" || f.severity === "low"
              ? f.severity
              : "medium",
        }))
      : [],
    summary: String(s?.summary ?? "").slice(0, 1200),
  };
}

// ─── Heuristic fallbacks ───────────────────────────────────────
// Used when OPENAI_API_KEY isn't configured (local dev). Keeps the
// tool reachable so the UI flows can be exercised without an OpenAI
// account — the answers are deliberately generic so nobody mistakes
// the fallback for real AI output.

function fallbackOpening(ctx: InterviewSessionContext): { content: string; done: boolean } {
  return {
    content: `Hi! I'll be running this mock interview for the ${ctx.targetRole} role. To start: walk me through your most recent project relevant to ${ctx.evDomainSlug ?? "EV systems"} — what was your role, what tradeoffs did you make, and what did you learn?`,
    done: false,
  };
}

function fallbackNext(_ctx: InterviewSessionContext, history: InterviewTurn[]): { content: string; done: boolean } {
  const userTurns = history.filter((t) => t.role === "user").length;
  if (userTurns >= TARGET_TURNS) {
    return {
      content:
        "Great — we've covered a lot of ground. Hit \"End interview\" below to see the feedback summary.",
      done: true,
    };
  }
  const prompts = [
    "Can you walk me through a tradeoff decision you've made under tight constraints? What were the options and why did you pick the one you did?",
    "Tell me about a time you disagreed with a stakeholder on a technical call. How did you resolve it?",
    "What's a topic in the EV industry you've been reading about recently that you find genuinely interesting?",
    "How would you debug a system you don't fully understand? Talk me through your first 24 hours.",
    "Where do you want to be technically in 18 months? What would you be doing that you can't do today?",
  ];
  return { content: prompts[userTurns % prompts.length], done: false };
}

function fallbackSummary(): InterviewSummary {
  return {
    overall: 60,
    breakdown: {
      technicalDepth: 60,
      communicationClarity: 60,
      structuredThinking: 60,
      evIndustryAwareness: 60,
      behaviouralFit: 60,
    },
    feedback: [
      {
        title: "AI scoring unavailable",
        body:
          "The OpenAI key isn't configured on this environment so we couldn't score this transcript. Your answers are saved — try again on a deployment with AI enabled to get a real scored breakdown.",
        severity: "low",
      },
    ],
    summary:
      "Heuristic fallback summary — AI scoring is disabled on this environment. Your transcript is saved for later review.",
  };
}
