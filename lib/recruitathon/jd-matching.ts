import "server-only";

import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { getCandidateForMatch, matchJds, type JdMatch } from "@/lib/ai/recruitathon-match";

/**
 * Ranked JD list for a candidate — the JD catalog with an AI match
 * score attached, best-fit first. The (expensive) AI match is cached
 * per candidate for 30 min so re-opening the selector doesn't re-bill;
 * profile edits refresh within that window (or immediately after a
 * fresh onboarding, which is the common path).
 */

export interface RankedJd {
  jd: {
    id: string;
    slug: string;
    company: string;
    role: string;
    level: "BASIC" | "INTERMEDIATE" | "ADVANCED";
    eligibility: string | null;
    location: string | null;
    description: string;
    skills: string[];
    assessmentId: string | null;
  };
  match: JdMatch;
}

export async function getRankedJdsForCandidate(candidateId: string, driveId: string): Promise<RankedJd[]> {
  const jds = await db.recruitathonJd.findMany({
    where: { driveId, isActive: true },
    orderBy: [{ sortOrder: "asc" }],
    select: {
      id: true, slug: true, company: true, role: true, level: true,
      eligibility: true, location: true, description: true, skills: true, assessmentId: true,
    },
  });
  if (jds.length === 0) return [];

  const cand = await getCandidateForMatch(candidateId);
  if (!cand) return jds.map((jd) => ({ jd, match: { jdId: jd.id, score: 0, reason: "" } }));

  const jdsForMatch = jds.map((j) => ({ id: j.id, company: j.company, role: j.role, level: j.level, skills: j.skills, eligibility: j.eligibility }));

  // Cache the AI match keyed by candidate id (30 min). A JD-set hash is
  // baked into the key so adding/removing JDs busts the cache.
  const jdSetKey = jds.map((j) => j.id).join(",").length + "x" + jds.length;
  const cachedMatch = unstable_cache(
    async () => matchJds(cand, jdsForMatch),
    ["recruitathon-jd-match", candidateId, jdSetKey],
    { revalidate: 1800, tags: [`recruitathon-match:${candidateId}`] },
  );
  const matches = await cachedMatch();
  const byId = new Map(matches.map((m) => [m.jdId, m]));

  return jds.map((jd) => ({ jd, match: byId.get(jd.id) ?? { jdId: jd.id, score: 0, reason: "" } }));
}
