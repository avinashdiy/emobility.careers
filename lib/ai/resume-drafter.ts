import { z } from "zod";
import { openai, aiModels } from "@/lib/ai/openai";
import type { Prisma } from "@prisma/client";

/**
 * AI résumé drafter.
 *
 * Takes a candidate profile (with all relations) and asks GPT to clean up
 * the prose into a structured, ATS-friendly résumé JSON. The structured
 * output is then rendered to PDF by `lib/pdf/resume-pdf.ts` — the LLM
 * never produces the PDF directly, so the layout stays consistent across
 * every candidate.
 *
 * Why a defined schema?
 *   - Deterministic structure → easier to render, easier to QA
 *   - LLM only fills in what it can improve (rephrase summary, polish
 *     experience bullets) without inventing facts the candidate didn't
 *     supply
 *   - On API failure we fall back to the raw profile fields rendered as-is.
 */

const ResumeDraftSchema = z.object({
  header: z.object({
    fullName: z.string(),
    headline: z.string().optional(),
    location: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    linkedinUrl: z.string().optional(),
    githubUrl: z.string().optional(),
    portfolioUrl: z.string().optional(),
  }),
  summary: z.string().optional(),
  experience: z.array(z.object({
    title: z.string(),
    company: z.string(),
    location: z.string().optional(),
    startDate: z.string(),
    endDate: z.string().optional(),
    bullets: z.array(z.string()).default([]),
  })).default([]),
  education: z.array(z.object({
    institution: z.string(),
    degree: z.string().optional(),
    field: z.string().optional(),
    startYear: z.number().optional(),
    endYear: z.number().optional(),
    grade: z.string().optional(),
  })).default([]),
  skills: z.array(z.string()).default([]),
  certifications: z.array(z.object({
    name: z.string(),
    issuer: z.string().optional(),
    year: z.number().optional(),
  })).default([]),
  projects: z.array(z.object({
    title: z.string(),
    description: z.string().optional(),
    url: z.string().optional(),
    techStack: z.array(z.string()).default([]),
  })).default([]),
});

export type ResumeDraft = z.infer<typeof ResumeDraftSchema>;

export interface CandidateForDraft {
  firstName: string;
  lastName: string | null;
  headline: string | null;
  summary: string | null;
  location: string | null;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  portfolioUrl: string | null;
  totalExperienceMonths: number;
  experiences: { title: string; company: string; location: string | null; startDate: Date; endDate: Date | null; current: boolean; description: string | null }[];
  education: { institution: string; degree: string | null; field: string | null; startYear: number | null; endYear: number | null; grade: string | null }[];
  skills: { skill: { name: string }; proficiency: string }[];
  certifications: { name: string; issuer: string | null; issueDate: Date | null }[];
  projects: { title: string; description: string | null; url: string | null; techStack: string[] }[];
}

/**
 * Builds a resume draft. If OPENAI_API_KEY is missing or the call fails,
 * returns a deterministic structured fallback so PDF generation always
 * succeeds — degraded UX is better than a 500.
 */
export async function buildResumeDraft(c: CandidateForDraft): Promise<ResumeDraft> {
  const fallback = profileToFallbackDraft(c);

  if (!process.env.OPENAI_API_KEY) return fallback;

  const profileSummary = JSON.stringify({
    name: `${c.firstName} ${c.lastName ?? ""}`.trim(),
    headline: c.headline,
    summary: c.summary,
    yearsExperience: (c.totalExperienceMonths / 12).toFixed(1),
    experience: c.experiences.map((e) => ({
      title: e.title,
      company: e.company,
      location: e.location,
      from: e.startDate.toISOString().slice(0, 7),
      to: e.current ? "Present" : e.endDate?.toISOString().slice(0, 7),
      description: e.description,
    })),
    education: c.education.map((e) => ({
      institution: e.institution,
      degree: e.degree,
      field: e.field,
      years: [e.startYear, e.endYear].filter(Boolean).join("–"),
      grade: e.grade,
    })),
    skills: c.skills.map((s) => s.skill.name),
    certifications: c.certifications.map((cert) => ({
      name: cert.name,
      issuer: cert.issuer,
      year: cert.issueDate?.getFullYear(),
    })),
    projects: c.projects.map((p) => ({
      title: p.title,
      description: p.description,
      url: p.url,
      techStack: p.techStack,
    })),
  });

  const prompt = `You are an expert résumé writer for the EV (electric vehicle) industry. Given the candidate's structured profile data, produce an ATS-friendly résumé as JSON matching this schema:

{
  "header": { fullName, headline, location, email, phone, linkedinUrl, githubUrl, portfolioUrl },
  "summary": "2-3 punchy lines",
  "experience": [{ title, company, location, startDate, endDate, bullets: ["impact-driven bullets"] }],
  "education": [{ institution, degree, field, startYear, endYear, grade }],
  "skills": ["short, canonical names"],
  "certifications": [{ name, issuer, year }],
  "projects": [{ title, description, url, techStack: [...] }]
}

Rules:
- Do NOT invent facts. Only rephrase what the candidate already supplied.
- Bullets should start with strong verbs (Designed, Led, Built, Improved). Use measurable outcomes when present.
- Headline should be a one-line title (e.g. "Battery Management Systems Engineer").
- Summary: 2–3 sentences. Mention domain expertise + years of experience + what kind of role they're looking for.
- For experience without a description, leave bullets empty.
- Return ONLY the JSON. No prose, no markdown fences.

Candidate profile:
${profileSummary}`;

  try {
    const completion = await openai.chat.completions.create({
      model: aiModels.parser,
      response_format: { type: "json_object" },
      temperature: 0.4,
      messages: [
        { role: "system", content: "You are a precise résumé editor. Return only the requested JSON." },
        { role: "user", content: prompt },
      ],
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) return fallback;
    const parsed = ResumeDraftSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return fallback;
    return parsed.data;
  } catch {
    return fallback;
  }
}

function profileToFallbackDraft(c: CandidateForDraft): ResumeDraft {
  return {
    header: {
      fullName: `${c.firstName} ${c.lastName ?? ""}`.trim(),
      headline: c.headline ?? undefined,
      location: c.location ?? undefined,
      email: c.email ?? undefined,
      phone: c.phone ?? undefined,
      linkedinUrl: c.linkedinUrl ?? undefined,
      githubUrl: c.githubUrl ?? undefined,
      portfolioUrl: c.portfolioUrl ?? undefined,
    },
    summary: c.summary ?? undefined,
    experience: c.experiences.map((e) => ({
      title: e.title,
      company: e.company,
      location: e.location ?? undefined,
      startDate: e.startDate.toISOString().slice(0, 7),
      endDate: e.current ? "Present" : (e.endDate?.toISOString().slice(0, 7) ?? undefined),
      bullets: e.description ? e.description.split(/\r?\n/).map((s) => s.trim()).filter(Boolean) : [],
    })),
    education: c.education.map((e) => ({
      institution: e.institution,
      degree: e.degree ?? undefined,
      field: e.field ?? undefined,
      startYear: e.startYear ?? undefined,
      endYear: e.endYear ?? undefined,
      grade: e.grade ?? undefined,
    })),
    skills: c.skills.map((s) => s.skill.name),
    certifications: c.certifications.map((cert) => ({
      name: cert.name,
      issuer: cert.issuer ?? undefined,
      year: cert.issueDate?.getFullYear() ?? undefined,
    })),
    projects: c.projects.map((p) => ({
      title: p.title,
      description: p.description ?? undefined,
      url: p.url ?? undefined,
      techStack: p.techStack,
    })),
  };
}

/** Prisma include payload that matches the CandidateForDraft shape. */
export const RESUME_DRAFT_INCLUDE = {
  experiences: { orderBy: { startDate: "desc" } },
  education: { orderBy: { startYear: "desc" } },
  skills: { include: { skill: true } },
  certifications: { orderBy: { issueDate: "desc" } },
  projects: { orderBy: { createdAt: "desc" } },
} satisfies Prisma.CandidateProfileInclude;
