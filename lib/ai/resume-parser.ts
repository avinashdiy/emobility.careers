import { openai, aiModels } from "@/lib/ai/openai";
import { z } from "zod";
import { logger } from "@/lib/logger";

/**
 * Parse a resume buffer (PDF or DOCX) into a structured ParsedResume.
 *
 * Pipeline:
 *   1. Extract raw text (pdf-parse for PDF, mammoth for DOCX).
 *   2. Send to OpenAI gpt-4o-mini with a strict JSON schema.
 *   3. Validate the response with Zod.
 */

export const ParsedExperienceSchema = z.object({
  title: z.string(),
  company: z.string(),
  location: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(), // YYYY-MM
  endDate: z.string().nullable().optional(),
  current: z.boolean().default(false),
  description: z.string().nullable().optional(),
});

export const ParsedEducationSchema = z.object({
  institution: z.string(),
  degree: z.string().nullable().optional(),
  field: z.string().nullable().optional(),
  startYear: z.number().int().nullable().optional(),
  endYear: z.number().int().nullable().optional(),
  grade: z.string().nullable().optional(),
});

export const ParsedCertificationSchema = z.object({
  name: z.string(),
  issuer: z.string().nullable().optional(),
  issueDate: z.string().nullable().optional(),
  credentialId: z.string().nullable().optional(),
  isDIYguru: z.boolean().default(false),
});

export const ParsedProjectSchema = z.object({
  title: z.string(),
  description: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  techStack: z.array(z.string()).default([]),
});

export const ParsedResumeSchema = z.object({
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  headline: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  linkedinUrl: z.string().nullable().optional(),
  githubUrl: z.string().nullable().optional(),
  portfolioUrl: z.string().nullable().optional(),
  totalExperienceMonths: z.number().int().nullable().optional(),
  skills: z.array(z.string()).default([]),
  experiences: z.array(ParsedExperienceSchema).default([]),
  education: z.array(ParsedEducationSchema).default([]),
  certifications: z.array(ParsedCertificationSchema).default([]),
  projects: z.array(ParsedProjectSchema).default([]),
  languages: z.array(z.string()).default([]),
  evDomains: z
    .array(
      z.enum([
        "battery-tech",
        "charging-infra",
        "powertrain",
        "motor-control",
        "vehicle-engineering",
        "fleet-mobility",
        "manufacturing",
        "software-iot",
        "after-sales",
        "policy-research",
      ]),
    )
    .default([]),
  detectedDIYguru: z.boolean().default(false),
});

export type ParsedResume = z.infer<typeof ParsedResumeSchema>;

export async function extractTextFromResume(
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  if (mimeType === "application/pdf" || mimeType.includes("pdf")) {
    const pdfParse = (await import("pdf-parse")).default;
    const data = await pdfParse(buffer);
    return data.text;
  }
  if (
    mimeType.includes("officedocument.wordprocessingml") ||
    mimeType.includes("msword") ||
    mimeType.includes("docx")
  ) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  // Fallback: treat as plain text.
  return buffer.toString("utf-8");
}

const SYSTEM_PROMPT = `You extract structured candidate profile data from resumes for an EV-industry hiring platform.

Rules:
- Return ONLY valid JSON matching the provided schema.
- Use ISO YYYY-MM for dates (or YYYY for years). Use null when unknown.
- Map skills/domains to the EV taxonomy: battery-tech, charging-infra, powertrain, motor-control, vehicle-engineering, fleet-mobility, manufacturing, software-iot, after-sales, policy-research.
- Only include EV domains the candidate clearly has experience or skills in.
- Set "detectedDIYguru" to true if the resume mentions "DIYguru" anywhere (any case/spelling).
- "totalExperienceMonths" is months of full-time work experience excluding internships unless they were the only roles.
- For "headline", create a short 1-line tagline if not explicit (e.g., "Senior Battery Engineer | Cell chemistry").`;

export async function parseResumeText(text: string): Promise<ParsedResume> {
  const trimmed = text.replace(/\s+/g, " ").trim().slice(0, 24_000);

  if (!process.env.OPENAI_API_KEY) {
    logger.warn("[resume-parser] OPENAI_API_KEY missing — returning empty parse");
    return ParsedResumeSchema.parse({});
  }

  const completion = await openai.chat.completions.create({
    model: aiModels.parser,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Resume text:\n\n"""\n${trimmed}\n"""\n\nReturn JSON with keys: firstName, lastName, email, phone, headline, summary, location, linkedinUrl, githubUrl, portfolioUrl, totalExperienceMonths, skills (string[]), experiences ({title, company, location, startDate, endDate, current, description}[]), education ({institution, degree, field, startYear, endYear, grade}[]), certifications ({name, issuer, issueDate, credentialId, isDIYguru}[]), projects ({title, description, url, techStack[]}[]), languages (string[]), evDomains (string[] from the taxonomy), detectedDIYguru (boolean).`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content ?? "{}";
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    logger.error({ content }, "[resume-parser] Invalid JSON from model");
    throw new Error("Resume parser returned invalid JSON");
  }

  const result = ParsedResumeSchema.safeParse(raw);
  if (!result.success) {
    logger.warn({ errors: result.error.flatten() }, "[resume-parser] Schema mismatch — coercing");
    // Fall back to a permissive merge so we still capture partial data.
    return ParsedResumeSchema.parse({
      ...(typeof raw === "object" && raw ? raw : {}),
      skills: [],
      experiences: [],
      education: [],
      certifications: [],
      projects: [],
      languages: [],
      evDomains: [],
    });
  }
  return result.data;
}

export async function parseResume(
  buffer: Buffer,
  mimeType: string,
): Promise<ParsedResume> {
  const text = await extractTextFromResume(buffer, mimeType);
  return parseResumeText(text);
}
