import { openai, aiModels } from "@/lib/ai/openai";
import { trackAICall } from "@/lib/ai/track-cost";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Internship Hunt Navigator engine.
 *
 * Hybrid tool: the server pulls a list of real INTERNSHIP-type
 * JobPosting rows from the database (filtered by domain + location),
 * hands them to the model alongside the candidate's input, and asks
 * the model to:
 *
 *   1. Pick the 5 strongest matches from the supplied list (the
 *      model can't invent internships — only re-rank what we gave
 *      it).
 *   2. Explain in one sentence per match WHY it fits, given the
 *      candidate's skills + goals.
 *   3. Surface 2-3 skill / experience gaps the candidate should
 *      close before applying.
 *   4. Write a one-paragraph "navigator note" — the overall coaching
 *      take, including what to do if no jobs match at all.
 *
 * When the supplied job list is empty (or short), the model gives
 * coaching-only advice ("here's what to do until internships open
 * up in your domain") instead of hallucinating fake roles.
 */

export interface NavigatorMatch {
  jobId: string;
  /// One-sentence pitch tied to the candidate's input — not a
  /// generic restatement of the JD.
  whyItFits: string;
  /// "strong" / "stretch" / "consider" — used as a coloured tag
  /// on the card so the candidate can scan match strength.
  matchStrength: "strong" | "stretch" | "consider";
}

export interface NavigatorGap {
  title: string;
  body: string;
}

export interface NavigatorResult {
  navigatorNote: string;
  matches: NavigatorMatch[];
  gaps: NavigatorGap[];
}

/**
 * Compact shape of a JobPosting passed into the engine. Kept
 * minimal so the prompt stays cheap — we ship the IDs back out so
 * the page can hydrate full job cards from the DB after re-ranking.
 */
export interface NavigatorJobInput {
  id: string;
  title: string;
  companyName: string;
  locations: string[];
  workMode: string;
  description: string;
  skillNames: string[];
}

export interface NavigatorInput {
  /// Free-text skills as the candidate typed them.
  rawSkills: string;
  /// EV-domain slug the candidate is targeting.
  evDomainSlug?: string | null;
  /// Cities the candidate is open to. Empty = open to anywhere.
  preferredCities: string[];
  /// Free-text career goal — drives the "navigator note" coaching
  /// tone. Optional.
  careerGoal?: string | null;
  /// The internship listings retrieved from the DB, pre-filtered.
  candidateJobs: NavigatorJobInput[];
}

export async function navigateInternships(input: NavigatorInput): Promise<NavigatorResult> {
  if (!env.OPENAI_API_KEY) return fallback(input);
  try {
    const jobsForPrompt = input.candidateJobs.slice(0, 20).map((j) => ({
      jobId: j.id,
      title: j.title,
      company: j.companyName,
      locations: j.locations.join(", ") || "Remote / flexible",
      workMode: j.workMode,
      skills: j.skillNames.slice(0, 12).join(", "),
      summary: j.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 600),
    }));

    const completion = await trackAICall(
      { feature: "internship-navigator", model: aiModels.parser },
      () =>
        openai.chat.completions.create({
          model: aiModels.parser,
          temperature: 0.2,
          response_format: { type: "json_object" },
          max_tokens: 1400,
          messages: [
            {
              role: "system",
              content: [
                "You are an EV-industry career advisor helping a student / early-career candidate find the right internship from a supplied list of open postings.",
                input.evDomainSlug
                  ? `The candidate is targeting the ${input.evDomainSlug.replace(/-/g, " ")} domain.`
                  : "The candidate hasn't picked a specific EV domain — be honest about fit across whatever the available list covers.",
                input.preferredCities.length > 0
                  ? `They prefer these cities: ${input.preferredCities.join(", ")}. Penalise matches that require relocating elsewhere unless the role is genuinely outstanding for them.`
                  : "They're open to working anywhere in India / remote.",
                input.careerGoal
                  ? `Their stated career goal: "${input.careerGoal.trim().slice(0, 400)}"`
                  : "",
                "",
                "Return ONLY valid JSON matching this exact shape:",
                "{",
                '  "navigatorNote": "1 paragraph — the overall coaching take. If the supplied list is empty or weak, this is where you give them a plan B (e.g. cold-outreach playbook, where to look outside the platform).",',
                '  "matches": [{ "jobId": "MUST be one of the jobId values from the supplied list — never invent IDs", "whyItFits": "1 sentence, specific to this candidate", "matchStrength": "strong" | "stretch" | "consider" }],',
                '  "gaps": [{ "title": "short skill or experience gap", "body": "1-2 sentences — why this blocks them, what to do in 2-4 weeks to close it" }]',
                "}",
                "Rules:",
                "- Return AT MOST 5 matches. Fewer is fine — don't pad. If only 2 jobs genuinely fit, return 2.",
                "- 'strong' = candidate could realistically be shortlisted today. 'stretch' = will need one extra skill or project to be competitive. 'consider' = far-from-perfect but worth a thoughtful application.",
                "- jobId MUST come from the supplied list. If the candidate's input doesn't match anything in the list, return matches: [] and explain in navigatorNote.",
                "- 'gaps' is 2-3 items, ordered by impact. Skip if the candidate's skills already cover the available roles.",
                "- Never invent companies, roles, salaries, or specific JD details that aren't in the supplied list.",
              ]
                .filter(Boolean)
                .join("\n"),
            },
            {
              role: "user",
              content:
                "Candidate skills: " +
                input.rawSkills.trim().slice(0, 2000) +
                "\n\nAvailable internships (JSON):\n" +
                JSON.stringify(jobsForPrompt, null, 2),
            },
          ],
        }),
    );
    const raw = completion.choices[0]?.message?.content ?? "{}";
    return validate(JSON.parse(raw), input.candidateJobs);
  } catch (err) {
    logger.warn({ err }, "[internship-navigator] fell back");
    return fallback(input);
  }
}

function validate(raw: unknown, jobs: NavigatorJobInput[]): NavigatorResult {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<NavigatorResult>;
  const allowedJobIds = new Set(jobs.map((j) => j.id));
  const matches = Array.isArray(r.matches)
    ? r.matches
        .filter((m) => m && typeof m === "object")
        .map((m) => {
          const o = m as Partial<NavigatorMatch>;
          return {
            jobId: String(o.jobId ?? ""),
            whyItFits: String(o.whyItFits ?? "").slice(0, 300),
            matchStrength:
              o.matchStrength === "strong" ||
              o.matchStrength === "stretch" ||
              o.matchStrength === "consider"
                ? o.matchStrength
                : ("consider" as const),
          };
        })
        // Drop hallucinated IDs — only keep matches whose jobId is
        // in the list we supplied to the model.
        .filter((m) => allowedJobIds.has(m.jobId))
        .slice(0, 5)
    : [];
  const gaps = Array.isArray(r.gaps)
    ? r.gaps
        .filter((g) => g && typeof g === "object")
        .map((g) => {
          const o = g as Partial<NavigatorGap>;
          return {
            title: String(o.title ?? "").slice(0, 120) || "Skill gap",
            body: String(o.body ?? "").slice(0, 400),
          };
        })
        .slice(0, 4)
    : [];
  return {
    navigatorNote: String(r.navigatorNote ?? "").slice(0, 1200),
    matches,
    gaps,
  };
}

function fallback(input: NavigatorInput): NavigatorResult {
  return {
    navigatorNote:
      input.candidateJobs.length === 0
        ? "We don't have any internships matching those filters in the database right now. Try widening the EV domain or removing the city filter, or use the Mock Interview tool to practice while you wait for new postings to land."
        : "AI ranking is disabled on this environment. Browse the matching list directly and use the Mock Interview tool to practice your strongest match.",
    matches: input.candidateJobs.slice(0, 5).map((j) => ({
      jobId: j.id,
      whyItFits: "Listed because it matched your filters. AI ranking is unavailable in this environment.",
      matchStrength: "consider" as const,
    })),
    gaps: [],
  };
}
