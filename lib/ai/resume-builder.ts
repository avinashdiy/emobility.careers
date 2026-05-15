import { openai, aiModels } from "@/lib/ai/openai";
import { trackAICall } from "@/lib/ai/track-cost";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * ATS Resume Creator engine.
 *
 * The form gives us a brain-dump: header fields (name, target role,
 * contact) + one big free-text block where the candidate pastes
 * everything else — past roles, projects, education, skills, in
 * whatever order they remember. The engine restructures that into
 * a clean ATS-friendly resume:
 *
 *   • Punchy 3-line summary anchored in the target role.
 *   • Experiences ordered newest-first, each with 3-5 bulletified
 *     achievements (not duties) — quantified where the candidate
 *     gave us numbers, otherwise tightened phrasing.
 *   • Education with degree + institution + year.
 *   • Skills flattened into a single comma-separated line at the
 *     top so ATS parsers index them — no fancy categorisation
 *     that some parsers choke on.
 *   • Projects (if any) with link + 1-line impact.
 *
 * The result is rendered by the page as a clean printable HTML
 * resume; the candidate uses the browser's Print → Save as PDF
 * to export. Future wave can add server-side PDF generation +
 * a Razorpay paywall on the export.
 */

export interface ResumeExperience {
  title: string;
  company: string;
  location: string;
  dates: string;
  bullets: string[];
}

export interface ResumeEducation {
  degree: string;
  institution: string;
  year: string;
  /// Optional one-line note (CGPA, honours, relevant coursework).
  note: string;
}

export interface ResumeProject {
  title: string;
  /// Optional URL — if present we render it as a hyperlink.
  url: string;
  /// 1-2 sentences max — ATS resumes don't need essays.
  description: string;
}

export interface ResumeCertification {
  name: string;
  issuer: string;
  year: string;
}

export interface BuiltResume {
  name: string;
  targetRole: string;
  contact: {
    email: string;
    phone: string;
    location: string;
    linkedin: string;
    portfolio: string;
  };
  summary: string;
  /// Comma-separated single line so ATS parsers grab them — no
  /// categorisation that some parsers strip.
  skillsLine: string;
  experiences: ResumeExperience[];
  education: ResumeEducation[];
  projects: ResumeProject[];
  certifications: ResumeCertification[];
}

export interface ResumeBuilderInput {
  name: string;
  targetRole: string;
  email: string;
  phone: string;
  location: string;
  linkedinUrl: string;
  portfolioUrl: string;
  /// The brain dump — past roles, projects, education, skills, all
  /// in the candidate's own words, in any order.
  brainDump: string;
  evDomainSlug?: string | null;
}

export async function buildResume(input: ResumeBuilderInput): Promise<BuiltResume> {
  if (!env.OPENAI_API_KEY) return fallback(input);
  try {
    const completion = await trackAICall(
      { feature: "resume-creator", model: aiModels.parser },
      () =>
        openai.chat.completions.create({
          model: aiModels.parser,
          temperature: 0.2,
          response_format: { type: "json_object" },
          max_tokens: 2400,
          messages: [
            {
              role: "system",
              content: [
                `You are restructuring a candidate's brain-dump into a clean ATS-friendly resume. The candidate is targeting a "${input.targetRole}" role.`,
                input.evDomainSlug
                  ? `Their EV-industry domain: "${input.evDomainSlug.replace(/-/g, " ")}". Lean into vocabulary recruiters in that domain search.`
                  : "Use general EV-industry vocabulary appropriate to the target role.",
                "",
                "Return ONLY valid JSON matching this exact shape:",
                "{",
                '  "summary": "3-line professional summary, no clichés. Anchor in the target role + their strongest 2-3 capabilities.",',
                '  "skillsLine": "comma-separated list of 12-25 hard skills the ATS should index — tools, languages, standards, frameworks. NO soft skills.",',
                '  "experiences": [{ "title": "role", "company": "company", "location": "city, country (or Remote)", "dates": "Month YYYY – Month YYYY or Present", "bullets": ["3-5 achievement bullets per role; quantified where numbers exist; lead with strong verbs (Designed, Led, Reduced, Shipped). No first-person pronouns."] }],',
                '  "education": [{ "degree": "B.Tech / M.Tech / Diploma etc", "institution": "school name", "year": "YYYY", "note": "optional CGPA / honours / coursework line" }],',
                '  "projects": [{ "title": "project name", "url": "optional URL, empty string if none", "description": "1-2 sentences max" }],',
                '  "certifications": [{ "name": "cert name", "issuer": "issuing body", "year": "YYYY" }]',
                "}",
                "Rules:",
                "- Never invent specifics that aren't in the brain dump. If a date / metric / employer name isn't there, leave the field as empty string or omit the entry.",
                "- Experiences: newest first. 3-5 bullets each. NO duties (\"responsible for…\"); ONLY achievements (\"reduced cell imbalance alerts by 40%\").",
                "- Use strong verbs at the start of every bullet. No first-person pronouns. No \"helped\" / \"assisted\" — those flag a passive resume.",
                "- skillsLine: ATS-grade. Concrete tools / standards / languages / hardware only. \"Battery Management Systems, BMS firmware, STM32, CAN bus, AUTOSAR\" YES. \"Team player, problem solver\" NO.",
                "- Order arrays sensibly: experiences newest-first, education newest-first, projects most-recent-first.",
              ]
                .filter(Boolean)
                .join("\n"),
            },
            {
              role: "user",
              content:
                `Name: ${input.name}\nTarget role: ${input.targetRole}\nContact: ${input.email} · ${input.phone} · ${input.location}\nLinkedIn: ${input.linkedinUrl}\nPortfolio: ${input.portfolioUrl}\n\nBrain dump:\n${input.brainDump.slice(0, 8000)}`,
            },
          ],
        }),
    );
    const raw = completion.choices[0]?.message?.content ?? "{}";
    return validate(input, JSON.parse(raw));
  } catch (err) {
    logger.warn({ err }, "[resume-builder] fell back");
    return fallback(input);
  }
}

function validate(input: ResumeBuilderInput, raw: unknown): BuiltResume {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<BuiltResume>;
  const exps = Array.isArray(r.experiences)
    ? r.experiences.slice(0, 8).map((e) => {
        const o = (e && typeof e === "object" ? e : {}) as Partial<ResumeExperience>;
        return {
          title: String(o.title ?? "").slice(0, 120),
          company: String(o.company ?? "").slice(0, 120),
          location: String(o.location ?? "").slice(0, 120),
          dates: String(o.dates ?? "").slice(0, 60),
          bullets: Array.isArray(o.bullets)
            ? o.bullets.slice(0, 7).map((b) => String(b).slice(0, 400))
            : [],
        };
      })
    : [];
  const edu = Array.isArray(r.education)
    ? r.education.slice(0, 6).map((e) => {
        const o = (e && typeof e === "object" ? e : {}) as Partial<ResumeEducation>;
        return {
          degree: String(o.degree ?? "").slice(0, 120),
          institution: String(o.institution ?? "").slice(0, 200),
          year: String(o.year ?? "").slice(0, 30),
          note: String(o.note ?? "").slice(0, 200),
        };
      })
    : [];
  const projects = Array.isArray(r.projects)
    ? r.projects.slice(0, 8).map((p) => {
        const o = (p && typeof p === "object" ? p : {}) as Partial<ResumeProject>;
        return {
          title: String(o.title ?? "").slice(0, 120),
          url: String(o.url ?? "").slice(0, 300),
          description: String(o.description ?? "").slice(0, 400),
        };
      })
    : [];
  const certs = Array.isArray(r.certifications)
    ? r.certifications.slice(0, 8).map((c) => {
        const o = (c && typeof c === "object" ? c : {}) as Partial<ResumeCertification>;
        return {
          name: String(o.name ?? "").slice(0, 120),
          issuer: String(o.issuer ?? "").slice(0, 120),
          year: String(o.year ?? "").slice(0, 30),
        };
      })
    : [];
  return {
    name: input.name,
    targetRole: input.targetRole,
    contact: {
      email: input.email,
      phone: input.phone,
      location: input.location,
      linkedin: input.linkedinUrl,
      portfolio: input.portfolioUrl,
    },
    summary: String(r.summary ?? "").slice(0, 800),
    skillsLine: String(r.skillsLine ?? "").slice(0, 800),
    experiences: exps,
    education: edu,
    projects,
    certifications: certs,
  };
}

function fallback(input: ResumeBuilderInput): BuiltResume {
  return {
    name: input.name,
    targetRole: input.targetRole,
    contact: {
      email: input.email,
      phone: input.phone,
      location: input.location,
      linkedin: input.linkedinUrl,
      portfolio: input.portfolioUrl,
    },
    summary:
      "AI resume generation is disabled on this environment (OPENAI_API_KEY missing). Try again on a deployment with AI enabled.",
    skillsLine: "",
    experiences: [],
    education: [],
    projects: [],
    certifications: [],
  };
}
