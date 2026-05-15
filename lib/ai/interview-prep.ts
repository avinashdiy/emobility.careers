import { openai, aiModels } from "@/lib/ai/openai";
import { trackAICall } from "@/lib/ai/track-cost";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Interview Prep engine — generates a structured study plan for a
 * candidate with an upcoming EV-industry interview. Distinct from
 * Mock Interview (which is interactive practice): this tool is the
 * READING that comes before the rehearsal. The output is 5-7 topic
 * cards, each with:
 *
 *   • Why it matters for the target role + company
 *   • 3-5 sample questions the candidate might actually be asked
 *   • A model-style answer outline ("how a senior candidate would
 *     structure their answer") — not a script to memorise, but a
 *     framework to think against
 *   • 2-3 ways to deepen knowledge (links to certs / reading / DIYguru
 *     courses where applicable)
 *
 * Also emits a one-paragraph "what to focus on in the last 24 hours"
 * cram note tuned to the days-to-interview window the candidate
 * provides.
 */

export interface PrepTopic {
  title: string;
  whyItMatters: string;
  sampleQuestions: string[];
  answerOutline: string;
  deepenWith: string[];
}

export interface InterviewPrepResult {
  /// One-paragraph cram note — what to do today / tonight given the
  /// time window the candidate has.
  cramNote: string;
  /// 5-7 topic cards, ordered by priority. The first card is what
  /// they should master first; the last is "nice to revise".
  topics: PrepTopic[];
}

export interface InterviewPrepInput {
  targetRole: string;
  targetCompany?: string | null;
  seniorityLevel: string;
  evDomainSlug?: string | null;
  /// Days until the interview. 0 = today. Drives the cram-note tone:
  /// 1-2 days = "what to do tonight", 7+ days = "what to study this
  /// week".
  daysUntil: number;
  /// Optional free-text — anything specific the candidate wants
  /// covered (e.g. "they said the round will focus on BMS thermal
  /// behaviour").
  focus?: string | null;
}

export async function generateInterviewPrep(
  input: InterviewPrepInput,
): Promise<InterviewPrepResult> {
  if (!env.OPENAI_API_KEY) return fallback(input);
  try {
    const completion = await trackAICall(
      { feature: "interview-prep", model: aiModels.parser },
      () =>
        openai.chat.completions.create({
          model: aiModels.parser,
          temperature: 0.3,
          response_format: { type: "json_object" },
          max_tokens: 1600,
          messages: [
            {
              role: "system",
              content: [
                `You are an EV-industry hiring coach producing a study plan for a candidate interviewing for a ${input.seniorityLevel.toLowerCase()}-level ${input.targetRole} role${input.targetCompany ? ` at ${input.targetCompany}` : ""}.`,
                input.evDomainSlug
                  ? `Emphasise topics in the ${input.evDomainSlug.replace(/-/g, " ")} domain.`
                  : "Cover the full EV-engineering breadth — battery, charging, motors, software, industry context — weighted to what this role would actually ask about.",
                input.focus
                  ? `The candidate flagged this specific focus: "${input.focus.trim().slice(0, 500)}"`
                  : "",
                `They have ${input.daysUntil} day${input.daysUntil === 1 ? "" : "s"} until the interview. Tune the cram-note tone accordingly — a same-day plan is very different from a one-week plan.`,
                "",
                "Return ONLY valid JSON matching this exact shape:",
                "{",
                '  "cramNote": "one paragraph — what to do today/tonight/this week given the time window. Specific, not generic.",',
                '  "topics": [',
                "    {",
                '      "title": "short, specific topic name",',
                '      "whyItMatters": "1-2 sentences — why THIS role at THIS company asks about this",',
                '      "sampleQuestions": ["3-5 actual phrasings of questions the candidate might be asked, in plain English"],',
                '      "answerOutline": "2-3 sentences describing how a strong candidate would structure their answer (frameworks, examples to reach for, traps to avoid). NOT a script.",',
                '      "deepenWith": ["2-3 ways to deepen knowledge — book/cert/course/standard names, public datasheets, etc."]',
                "    }",
                "  ]",
                "}",
                "Rules:",
                "- 5-7 topics. Order by priority — what they should master first comes first.",
                "- Be SPECIFIC. 'Lithium-ion fundamentals' is vague; 'NMC vs LFP tradeoffs for Indian 2W use cases' is what we want.",
                "- Sample questions should sound like real interview questions, not textbook prompts.",
                "- Answer outlines should help the candidate think, not give them a script.",
                "- Deepen-with items must be REAL resources — name them precisely (e.g. 'AIS-156 standard', 'Battery University BU-204', 'IIT Madras NPTEL EV systems course'). If you're unsure of a specific resource, omit rather than invent.",
              ]
                .filter(Boolean)
                .join("\n"),
            },
            {
              role: "user",
              content: `Generate the study plan now. Role: ${input.targetRole} · Seniority: ${input.seniorityLevel}${input.targetCompany ? ` · Company: ${input.targetCompany}` : ""}.`,
            },
          ],
        }),
    );
    const raw = completion.choices[0]?.message?.content ?? "{}";
    return validate(JSON.parse(raw));
  } catch (err) {
    logger.warn({ err }, "[interview-prep] fell back");
    return fallback(input);
  }
}

function validate(raw: unknown): InterviewPrepResult {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<InterviewPrepResult>;
  const topics = Array.isArray(r.topics)
    ? r.topics.slice(0, 7).map((t) => {
        const o = (t && typeof t === "object" ? t : {}) as Partial<PrepTopic>;
        return {
          title: String(o.title ?? "").slice(0, 120) || "Topic",
          whyItMatters: String(o.whyItMatters ?? "").slice(0, 400),
          sampleQuestions: Array.isArray(o.sampleQuestions)
            ? o.sampleQuestions.slice(0, 5).map((q) => String(q).slice(0, 300))
            : [],
          answerOutline: String(o.answerOutline ?? "").slice(0, 500),
          deepenWith: Array.isArray(o.deepenWith)
            ? o.deepenWith.slice(0, 5).map((q) => String(q).slice(0, 200))
            : [],
        };
      })
    : [];
  return {
    cramNote: String(r.cramNote ?? "").slice(0, 800),
    topics,
  };
}

function fallback(input: InterviewPrepInput): InterviewPrepResult {
  return {
    cramNote: `AI study-plan generation is disabled on this environment (OPENAI_API_KEY missing). In ${input.daysUntil} day${input.daysUntil === 1 ? "" : "s"}, focus on the technical fundamentals of the ${input.targetRole} role and review your most recent EV-related project in detail.`,
    topics: [
      {
        title: "AI generation unavailable",
        whyItMatters:
          "Add OPENAI_API_KEY to enable the full study plan. Until then this tool returns a placeholder.",
        sampleQuestions: [],
        answerOutline: "",
        deepenWith: [],
      },
    ],
  };
}
