import { z } from "zod";

/**
 * Shared MCQ-question shape used by the standalone skill-assessment
 * runner. Kept in its own module so the synchronous parser can be
 * imported from server pages + the action file without forcing the
 * action file to violate the "server actions must be async" rule.
 */

const skillAssessmentQuestionSchema = z.object({
  id: z.string(),
  text: z.string(),
  options: z.array(z.string()).min(2).max(8),
  correctOption: z.number().int().min(0).max(7),
});

export interface SkillAssessmentQuestion {
  id: string;
  text: string;
  options: string[];
  correctOption: number;
}

/** Reads the questions JSON off an Assessment row and validates it
 *  against the expected MCQ shape. Returns an empty array when the
 *  JSON is missing or malformed — callers render an empty-state in
 *  that case rather than crashing the page. */
export function parseSkillAssessmentQuestions(
  questionsJson: unknown,
): SkillAssessmentQuestion[] {
  const parsed = z
    .object({ questions: z.array(skillAssessmentQuestionSchema) })
    .safeParse(questionsJson);
  if (!parsed.success) return [];
  return parsed.data.questions;
}
