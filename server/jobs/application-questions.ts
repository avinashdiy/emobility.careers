/**
 * #2 Structured application narrative — shared helpers.
 *
 * The recruiter defines up to 3 short, role-specific questions on
 * the job posting (`JobPosting.applicationQuestions`). At apply time
 * the candidate answers them; the answers land on
 * `Application.questionAnswers`. Both columns are `Json?` so the
 * shape lives here and stays consistent across the apply form, the
 * recruiter editor, and the ATS detail view.
 *
 * Design-thinking rationale: a generic "tell us why you're
 * interested" prompt produces low-signal cover-letter prose. Role-
 * specific prompts ("describe a project where you implemented OCPP
 * 1.6") force the candidate to give the recruiter the exact signal
 * they need to triage 200 applicants. The recruiter then scans
 * answers side-by-side instead of reading 200 cover letters.
 */

import { z } from "zod";

export const MAX_QUESTIONS_PER_JOB = 3;
export const MAX_PROMPT_LENGTH = 220;
export const MAX_ANSWER_LENGTH = 1000;

export interface ApplicationQuestion {
  /// Stable id — generated at edit time, kept across saves so
  /// existing answers map back to the right prompt even after the
  /// recruiter reorders/renames questions. Format: `q-<8hex>`.
  id: string;
  prompt: string;
  required?: boolean;
}

// `id` regex is tight on purpose — the question id round-trips into
// `name="answer-${q.id}"` form input attributes + `htmlFor` /
// `aria-labelledby` references on the apply form. Pre-fix we
// allowed `min(1).max(40)`, which trusted anything a malformed
// JSON write could carry through (an admin import that bypasses
// `normalizeApplicationQuestions`, a future raw SQL touch, etc.).
// Tighten to the canonical `q-<8 hex>` shape minted by both the
// recruiter editor and `mintQuestionId` below.
const QUESTION_ID_RE = /^q-[a-f0-9]{8}$/;

const questionSchema = z.object({
  id: z.string().regex(QUESTION_ID_RE),
  prompt: z.string().trim().min(8).max(MAX_PROMPT_LENGTH),
  required: z.boolean().optional(),
});

const questionsArraySchema = z.array(questionSchema).max(MAX_QUESTIONS_PER_JOB);

/**
 * Parse the JSON column value coming back from Prisma into a typed
 * array. Returns [] for null / malformed / empty inputs so callers
 * never have to handle the Json?-from-Prisma quirk inline.
 */
export function parseApplicationQuestions(raw: unknown): ApplicationQuestion[] {
  if (!raw) return [];
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  const result = questionsArraySchema.safeParse(parsed);
  return result.success ? result.data : [];
}

/**
 * Same shape coming the other way — from a recruiter form save into
 * a Json value Prisma will accept. Mints fresh ids for new entries
 * (recognises pre-existing `q-<hex>` ids and preserves them).
 */
export function normalizeApplicationQuestions(
  inputs: { id?: string; prompt: string; required?: boolean }[],
): ApplicationQuestion[] {
  const out: ApplicationQuestion[] = [];
  for (const raw of inputs.slice(0, MAX_QUESTIONS_PER_JOB)) {
    const prompt = (raw.prompt ?? "").trim();
    if (prompt.length < 8) continue;
    out.push({
      id: raw.id && QUESTION_ID_RE.test(raw.id) ? raw.id : mintQuestionId(),
      prompt: prompt.slice(0, MAX_PROMPT_LENGTH),
      required: !!raw.required,
    });
  }
  return out;
}

function mintQuestionId(): string {
  // 8 hex chars = 4 bytes random; collision probability across the 3
  // max questions in a single job is negligible. Web Crypto would be
  // overkill — we just need a stable, unique-within-job string.
  let hex = "";
  for (let i = 0; i < 8; i++) {
    hex += Math.floor(Math.random() * 16).toString(16);
  }
  return `q-${hex}`;
}

/**
 * Parse the candidate's answers JSON back into a record keyed by
 * question id, with each value capped at MAX_ANSWER_LENGTH.
 */
export function parseApplicationAnswers(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string" && v.trim().length > 0) {
      out[k] = v.trim().slice(0, MAX_ANSWER_LENGTH);
    }
  }
  return out;
}

/**
 * Convert a FormData (the apply form) into the answers record,
 * looking for `q-<hex>` keys. Trims, drops empties, caps length.
 */
export function answersFromFormData(
  fd: FormData,
  questions: ApplicationQuestion[],
): { answers: Record<string, string>; missingRequired: ApplicationQuestion[] } {
  const answers: Record<string, string> = {};
  const missingRequired: ApplicationQuestion[] = [];
  for (const q of questions) {
    const raw = fd.get(`answer-${q.id}`);
    const text = typeof raw === "string" ? raw.trim().slice(0, MAX_ANSWER_LENGTH) : "";
    if (text.length > 0) {
      answers[q.id] = text;
    } else if (q.required) {
      missingRequired.push(q);
    }
  }
  return { answers, missingRequired };
}
