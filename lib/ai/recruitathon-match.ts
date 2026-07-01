import "server-only";

import { db } from "@/lib/db";
import { structuredJsonCall } from "@/lib/ai/structured";
import { logger } from "@/lib/logger";

/**
 * Recruitathon profile→JD matcher. Given a candidate's profile and the
 * JD catalog, returns a 0–100 fit score + one-line reason per JD, so
 * the selector can pre-rank + highlight best-fit roles. Uses OpenAI
 * when available; falls back to a deterministic skills-overlap +
 * education-fit heuristic so the selector always works.
 */

export interface JdForMatch {
  id: string;
  company: string;
  role: string;
  level: "BASIC" | "INTERMEDIATE" | "ADVANCED";
  skills: string[];
  eligibility: string | null;
}

export interface CandidateForMatch {
  headline: string | null;
  summary: string | null;
  educationLevel: "ITI" | "DIPLOMA" | "BACHELOR" | "MASTER" | "PHD" | "OTHER";
  degrees: string[];
  skills: string[];
  experienceYears: number;
  titles: string[];
}

export interface JdMatch {
  jdId: string;
  score: number;
  reason: string;
}

/** Classify the candidate's highest qualification from their degrees. */
function educationLevel(degrees: string[]): CandidateForMatch["educationLevel"] {
  const d = degrees.join(" ").toLowerCase();
  if (/ph\.?d|doctor/.test(d)) return "PHD";
  if (/m\.?tech|m\.?e\b|master|m\.?sc|mba/.test(d)) return "MASTER";
  if (/b\.?tech|b\.?e\b|bachelor|b\.?sc|be\b/.test(d)) return "BACHELOR";
  if (/diploma/.test(d)) return "DIPLOMA";
  if (/iti\b|i\.t\.i|trade/.test(d)) return "ITI";
  return "OTHER";
}

/** Build the match input from a candidate profile id. */
export async function getCandidateForMatch(candidateId: string): Promise<CandidateForMatch | null> {
  const p = await db.candidateProfile.findUnique({
    where: { id: candidateId },
    select: {
      headline: true,
      summary: true,
      skills: { select: { skill: { select: { name: true } } } },
      education: { select: { degree: true, field: true } },
      experiences: { select: { title: true, startDate: true, endDate: true, current: true } },
    },
  });
  if (!p) return null;

  const degrees = p.education.map((e) => [e.degree, e.field].filter(Boolean).join(" ")).filter(Boolean);
  const now = Date.now();
  const months = p.experiences.reduce((n, x) => {
    const end = x.current || !x.endDate ? now : x.endDate.getTime();
    return n + Math.max(0, (end - x.startDate.getTime()) / (1000 * 60 * 60 * 24 * 30));
  }, 0);

  return {
    headline: p.headline,
    summary: p.summary,
    educationLevel: educationLevel(degrees),
    degrees,
    skills: p.skills.map((s) => s.skill.name),
    experienceYears: Math.round((months / 12) * 10) / 10,
    titles: p.experiences.map((x) => x.title),
  };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Deterministic fallback — skills overlap + education-vs-level fit. */
export function heuristicMatch(cand: CandidateForMatch, jds: JdForMatch[]): JdMatch[] {
  const candSkills = new Set(cand.skills.map(norm).filter(Boolean));
  const eduRank: Record<CandidateForMatch["educationLevel"], number> = { ITI: 1, DIPLOMA: 2, OTHER: 2, BACHELOR: 3, MASTER: 4, PHD: 4 };
  const jdRank: Record<JdForMatch["level"], number> = { BASIC: 1, INTERMEDIATE: 2, ADVANCED: 3 };
  return jds.map((jd) => {
    const jdSkills = jd.skills.map(norm).filter(Boolean);
    const hits = jdSkills.filter((s) => candSkills.has(s) || [...candSkills].some((c) => c.includes(s) || s.includes(c))).length;
    const overlap = jdSkills.length ? hits / jdSkills.length : 0; // 0..1
    // Education fit: best when candidate meets-or-slightly-exceeds the JD level.
    const gap = eduRank[cand.educationLevel] - jdRank[jd.level];
    const eduFit = gap >= 0 ? Math.max(0.55, 1 - gap * 0.15) : Math.max(0.2, 1 + gap * 0.25);
    const score = Math.round(Math.min(100, (overlap * 0.65 + eduFit * 0.35) * 100));
    const reason = hits > 0 ? `${hits} matching skill${hits === 1 ? "" : "s"}` : "Based on your background";
    return { jdId: jd.id, score, reason };
  });
}

/** AI match with graceful heuristic fallback. Returns a score for EVERY jd. */
export async function matchJds(cand: CandidateForMatch, jds: JdForMatch[]): Promise<JdMatch[]> {
  const fallback = heuristicMatch(cand, jds);
  if (!process.env.OPENAI_API_KEY || jds.length === 0) return fallback;

  try {
    const { data } = await structuredJsonCall<{ matches: JdMatch[] }>({
      feature: "recruitathon-jd-match",
      maxOutputTokens: 2200,
      temperature: 0.2,
      system:
        "You are an EV-industry recruitment matcher. Score how well a candidate fits each job (0-100) using three signals: (1) overlap between the candidate's skills/experience and the JD's required skills, (2) whether the candidate's education meets the JD's eligibility, (3) relevant job titles. Be discriminating — reserve 85-100 for strong fits, 60-84 for decent, 30-59 for weak, <30 for poor. Return STRICT JSON.",
      user:
        `CANDIDATE:\n${JSON.stringify({ headline: cand.headline, summary: cand.summary?.slice(0, 500), education: cand.educationLevel, degrees: cand.degrees, skills: cand.skills, experienceYears: cand.experienceYears, pastTitles: cand.titles })}\n\n` +
        `JOBS (score every one):\n${JSON.stringify(jds.map((j) => ({ jdId: j.id, company: j.company, role: j.role, level: j.level, eligibility: j.eligibility, skills: j.skills })))}\n\n` +
        `Return {"matches":[{"jdId":"...","score":0-100,"reason":"<=12 words on why"}]} covering ALL jobs.`,
    });

    const byId = new Map(fallback.map((m) => [m.jdId, m]));
    for (const m of data.matches ?? []) {
      if (byId.has(m.jdId) && typeof m.score === "number") {
        byId.set(m.jdId, { jdId: m.jdId, score: Math.max(0, Math.min(100, Math.round(m.score))), reason: (m.reason ?? "").slice(0, 90) || byId.get(m.jdId)!.reason });
      }
    }
    return jds.map((j) => byId.get(j.id)!);
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "[recruitathon-match] AI match failed — using heuristic");
    return fallback;
  }
}
