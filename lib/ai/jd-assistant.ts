import { openai, aiModels } from "@/lib/ai/openai";
import { trackAICall } from "@/lib/ai/track-cost";
import { z } from "zod";

const JDSuggestionSchema = z.object({
  description: z.string(),
  responsibilities: z.string(),
  requirements: z.string(),
  skills: z.array(z.string()),
  evDomains: z.array(z.string()),
  seniorityLevel: z.string(),
  benefits: z.string().optional(),
});
export type JDSuggestion = z.infer<typeof JDSuggestionSchema>;

const SYSTEM = `You are a senior EV-industry recruiter. From rough notes, produce a polished JD with structured fields.
Rules:
- Concise, factual, no fluff or buzzwords.
- Use bullet points (• or -) for responsibilities and requirements.
- "skills" must be a flat array of canonical skill names (e.g., "Battery Pack Design", "OCPP 1.6", "PMSM").
- "evDomains" must be slugs from: battery-tech, charging-infra, powertrain, motor-control, vehicle-engineering, fleet-mobility, manufacturing, software-iot, after-sales, policy-research.
- "seniorityLevel" one of: ENTRY, JUNIOR, MID, SENIOR, LEAD, PRINCIPAL.`;

/** Pass-through fallback that returns the recruiter's raw notes plus
 *  TODO scaffolding when the AI path is unavailable (no key) or fails
 *  (rate-limit, network blip, malformed JSON). The job-posting form
 *  shows these placeholders + the user can refine — better than a 500
 *  on the first attempt. */
function jdFallback(input: { title: string; notes: string }): JDSuggestion {
  return JDSuggestionSchema.parse({
    description: input.notes,
    responsibilities: "- TODO: list responsibilities",
    requirements: "- TODO: list requirements",
    skills: [],
    evDomains: [],
    seniorityLevel: "MID",
  });
}

export async function draftJD(input: {
  title: string;
  notes: string;
  companyName?: string;
}): Promise<JDSuggestion> {
  if (!process.env.OPENAI_API_KEY) {
    return jdFallback(input);
  }
  try {
    const completion = await trackAICall(
      { feature: "jd-assistant.draft", model: aiModels.rerank },
      () =>
        openai.chat.completions.create({
          model: aiModels.rerank,
          temperature: 0.3,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM },
            {
              role: "user",
              content: `Job title: ${input.title}\nCompany: ${input.companyName ?? "(EV company)"}\n\nNotes from hiring manager:\n${input.notes}\n\nReturn JSON: {description, responsibilities, requirements, skills[], evDomains[], seniorityLevel, benefits?}.`,
            },
          ],
        }),
    );
    const raw = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    return JDSuggestionSchema.parse(raw);
  } catch {
    // OpenAI flake / Zod rejection / invalid JSON → fallback. The
    // recruiter still gets a starting point in the form rather than
    // a 500 from the job-posting page.
    return jdFallback(input);
  }
}
