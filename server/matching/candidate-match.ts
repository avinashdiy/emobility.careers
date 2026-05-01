import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { embed, jobEmbeddingText, profileEmbeddingText } from "@/lib/ai/embeddings";

/**
 * Candidate-facing match scorer.
 *
 * The employer-side scorer (server/matching/score.ts) ranks the whole
 * candidate pool against a single job — heavy compute, called once
 * per ATS view. This module flips it: ONE candidate vs ONE job, with
 * 7-day caching so a logged-in candidate browsing /jobs sees their
 * "87% match" badge without burning embeddings on every page view.
 *
 * Same scoring model as the employer side (vector + skill jaccard +
 * domain overlap + DIYguru boost) so the number means the same thing
 * on both surfaces. Only the cache shape differs — JobMatchCache.
 *
 * Reasons (the human-readable "why" chips) are derived purely from
 * the deterministic breakdown — no GPT call. Reasons that justify a
 * GPT call (qualitative fit assessment) are deliberately scoped out
 * for v1 to keep cost predictable; the breakdown is enough for the
 * top-3 chips ("Skills match: 8/10", "Location fit: yes", "EV domain
 * overlap: Battery + Charging").
 */

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Runtime schema for the cached breakdown blob. Prisma stores `Json`
 * which deserialises as `unknown` — without this guard we'd be
 * forced to either trust the cache shape (and crash if the shape
 * drifts after a deploy) or scatter optional-chaining everywhere
 * downstream. The zod parse fails closed: a corrupted/old row gets
 * treated as a cache miss and recomputed on the next request, which
 * is exactly the recovery behaviour we want.
 */
const breakdownSchema = z.object({
  vectorScore: z.number(),
  skillScore: z.number(),
  domainScore: z.number(),
  diyguruBoost: z.number(),
  matchedSkills: z.array(z.string()),
  missingRequiredSkills: z.array(z.string()),
  sharedDomains: z.array(z.string()),
  reasons: z.array(z.string()),
  caveats: z.array(z.string()),
});

export interface CandidateMatch {
  score: number;
  /// Per-axis breakdown — lets the UI render bars + reason chips.
  breakdown: {
    vectorScore: number;
    skillScore: number;
    domainScore: number;
    diyguruBoost: number;
    matchedSkills: string[];
    missingRequiredSkills: string[];
    sharedDomains: string[];
    /// Top 3 positive reasons, e.g. ["Strong skill overlap (6 of 8)",
    /// "Same EV domain — Battery", "Senior-level fit"].
    reasons: string[];
    /// 0-2 caveats e.g. ["You're missing 2 required skills: SCADA, MQTT"].
    caveats: string[];
  };
  /// True when this came from the cache; useful for telemetry but the
  /// page UI ignores it.
  cached: boolean;
  computedAt: Date;
}

/**
 * Pull the (candidate, job) match — cached if fresh, otherwise compute
 * and persist. Returns `null` only when the candidate or job is
 * missing; never throws into the caller path because public job pages
 * shouldn't 500 on a transient embedding API hiccup.
 */
export async function getOrComputeCandidateMatch(
  candidateId: string,
  jobId: string,
): Promise<CandidateMatch | null> {
  // Cache hit path — keep this branch as cheap as possible since it's
  // the steady-state for any returning visitor.
  const now = new Date();
  const cached = await db.jobMatchCache.findUnique({
    where: { candidateId_jobId: { candidateId, jobId } },
  });
  if (cached && cached.expiresAt > now) {
    // Validate the JSON shape — if zod fails (cache predates a
    // breakdown-shape change, or a manual SQL edit corrupted the
    // row) we fall through to the recompute path. Cheaper to log
    // and recompute than to ship a broken UI.
    const parsed = breakdownSchema.safeParse(cached.breakdown);
    if (parsed.success) {
      return {
        score: cached.score,
        breakdown: parsed.data,
        cached: true,
        computedAt: cached.computedAt,
      };
    }
    logger.warn(
      { candidateId, jobId, issues: parsed.error.issues },
      "[candidate-match] cache row failed schema check — recomputing",
    );
  }

  // Compute path. We swallow individual errors so a single bad row
  // can't blackhole the whole job page.
  try {
    const fresh = await computeCandidateMatch(candidateId, jobId);
    if (!fresh) return null;
    // Upsert keyed on the unique (candidateId, jobId). If the row
    // was stale we update; if it never existed we create.
    await db.jobMatchCache.upsert({
      where: { candidateId_jobId: { candidateId, jobId } },
      create: {
        candidateId,
        jobId,
        score: fresh.score,
        breakdown: fresh.breakdown,
        expiresAt: new Date(now.getTime() + CACHE_TTL_MS),
      },
      update: {
        score: fresh.score,
        breakdown: fresh.breakdown,
        computedAt: now,
        expiresAt: new Date(now.getTime() + CACHE_TTL_MS),
      },
    });
    return { ...fresh, cached: false, computedAt: now };
  } catch (err) {
    logger.error({ err, candidateId, jobId }, "[candidate-match] compute failed");
    return null;
  }
}

/**
 * Internal — runs the scoring without touching the cache. Exposed for
 * the "Best matches for you" section which scores N jobs at once and
 * doesn't want N round-trips through the cache layer (it does its own
 * batched cache check).
 */
export async function computeCandidateMatch(
  candidateId: string,
  jobId: string,
): Promise<Omit<CandidateMatch, "cached" | "computedAt"> | null> {
  const [candidate, job] = await Promise.all([
    db.candidateProfile.findUnique({
      where: { id: candidateId },
      include: {
        skills: { include: { skill: true } },
        evDomains: { include: { evDomain: true } },
        experiences: { take: 3, orderBy: { startDate: "desc" } },
      },
    }),
    db.jobPosting.findUnique({
      where: { id: jobId },
      include: {
        skills: { include: { skill: true } },
        evDomains: { include: { evDomain: true } },
        company: true,
      },
    }),
  ]);
  if (!candidate || !job) return null;

  // Vector score — embed once on the candidate side, query the job's
  // stored vector. Two reasons we do it this way (vs the employer
  // path which embeds the job): the job's `jdEmbedding` is already
  // generated by the embeddings worker and is stable, and we only
  // need ONE candidate embedding (cheaper than re-embedding the JD).
  let vectorScore = 0;
  try {
    if (process.env.OPENAI_API_KEY) {
      const candidateText = profileEmbeddingText(candidate);
      const candidateVector = await embed(candidateText);
      const literal = `[${candidateVector.join(",")}]`;
      const rows = await db.$queryRaw<Array<{ score: number }>>`
        SELECT 1 - ("jdEmbedding" <=> ${literal}::vector) AS score
        FROM "JobPosting"
        WHERE id = ${job.id} AND "jdEmbedding" IS NOT NULL
      `;
      vectorScore = Number(rows[0]?.score ?? 0);
      if (!Number.isFinite(vectorScore)) vectorScore = 0;
    } else {
      // No OpenAI key — fall back to a JD-text-vs-profile-text token
      // overlap. Lossy but never zero, so candidates without API
      // budget still see a reasonable signal.
      vectorScore = textOverlapScore(jobEmbeddingText(job), profileEmbeddingText(candidate));
    }
  } catch (err) {
    logger.warn({ err }, "[candidate-match] vector score fell back");
    vectorScore = textOverlapScore(jobEmbeddingText(job), profileEmbeddingText(candidate));
  }

  // Skill overlap — same formula as the employer side so the score
  // reads identically on both surfaces.
  const requiredSkillIds = new Set(job.skills.filter((s) => s.required).map((s) => s.skillId));
  const allJobSkillIds = new Set(job.skills.map((s) => s.skillId));
  const candidateSkillIds = new Set(candidate.skills.map((s) => s.skillId));

  const requiredMatched = [...requiredSkillIds].filter((id) => candidateSkillIds.has(id));
  const requiredRatio = requiredSkillIds.size === 0 ? 1 : requiredMatched.length / requiredSkillIds.size;
  const allUnion = new Set([...allJobSkillIds, ...candidateSkillIds]);
  const allInter = [...allJobSkillIds].filter((id) => candidateSkillIds.has(id)).length;
  const jaccard = allUnion.size === 0 ? 0 : allInter / allUnion.size;
  const skillScore = requiredRatio * 0.7 + jaccard * 0.3;

  // Domain overlap.
  const jobDomainIds = new Set(job.evDomains.map((d) => d.evDomainId));
  const candidateDomainIds = new Set(candidate.evDomains.map((d) => d.evDomainId));
  const domUnion = new Set([...jobDomainIds, ...candidateDomainIds]);
  const domInter = [...jobDomainIds].filter((id) => candidateDomainIds.has(id)).length;
  const domainScore = domUnion.size === 0 ? 0.5 : domInter / domUnion.size;

  const diyguruBoost = candidate.isDIYguruVerified ? 0.1 : 0;

  const final =
    vectorScore * 0.5 + skillScore * 0.25 + domainScore * 0.15 + diyguruBoost;
  const score = Math.min(1, Math.max(0, final));

  // Build the human-friendly reasons list. We pick the top contributing
  // axes and turn each into a one-line chip — the UI shows up to 3.
  const matchedSkillNames = candidate.skills
    .filter((s) => allJobSkillIds.has(s.skillId))
    .map((s) => s.skill.name);
  const missingRequiredNames = job.skills
    .filter((s) => s.required && !candidateSkillIds.has(s.skillId))
    .map((s) => s.skill.name);
  const sharedDomainNames = job.evDomains
    .filter((d) => candidateDomainIds.has(d.evDomainId))
    .map((d) => d.evDomain.name);

  const reasons: string[] = [];
  if (matchedSkillNames.length > 0) {
    const top = matchedSkillNames.slice(0, 3).join(", ");
    reasons.push(
      matchedSkillNames.length >= 3
        ? `Strong skill match — ${top}, +${matchedSkillNames.length - 3} more`
        : `Skill match — ${top}`,
    );
  }
  if (sharedDomainNames.length > 0) {
    reasons.push(`Same EV domain — ${sharedDomainNames.slice(0, 2).join(" & ")}`);
  }
  if (vectorScore >= 0.6) {
    reasons.push("Profile reads as a close fit for this role");
  } else if (vectorScore >= 0.4 && reasons.length < 3) {
    reasons.push("Profile aligns with the role description");
  }
  if (candidate.isDIYguruVerified && reasons.length < 3) {
    reasons.push("DIYguru-verified — recruiters prioritise verified candidates");
  }
  // Experience-band reason (only if neither domain nor skills produced
  // a strong signal — gives us a fallback chip on weak matches).
  if (reasons.length < 3 && candidate.totalExperienceMonths > 0) {
    const yrs = Math.floor(candidate.totalExperienceMonths / 12);
    const min = job.experienceMin ?? 0;
    const max = job.experienceMax ?? 50;
    if (yrs >= min && yrs <= max) {
      reasons.push(`Experience in band (${yrs}y vs ${min}–${max}y required)`);
    }
  }

  const caveats: string[] = [];
  if (missingRequiredNames.length > 0) {
    caveats.push(
      missingRequiredNames.length === 1
        ? `Missing required skill: ${missingRequiredNames[0]}`
        : `Missing ${missingRequiredNames.length} required skills: ${missingRequiredNames.slice(0, 3).join(", ")}`,
    );
  }
  if (job.experienceMin != null && candidate.totalExperienceMonths < job.experienceMin * 12) {
    const shortBy = job.experienceMin - Math.floor(candidate.totalExperienceMonths / 12);
    caveats.push(`${shortBy}y short of the ${job.experienceMin}y experience floor`);
  }

  return {
    score,
    breakdown: {
      vectorScore,
      skillScore,
      domainScore,
      diyguruBoost,
      matchedSkills: matchedSkillNames,
      missingRequiredSkills: missingRequiredNames,
      sharedDomains: sharedDomainNames,
      reasons: reasons.slice(0, 3),
      caveats: caveats.slice(0, 2),
    },
  };
}

/**
 * Cheap fallback for the vector axis when OPENAI_API_KEY is unset or
 * the API is down. Token-overlap on lowercased word bags — primitive
 * but never zero, which keeps the UX from collapsing to "0% match"
 * during transient outages.
 */
function textOverlapScore(a: string, b: string): number {
  const tokens = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 2),
    );
  const A = tokens(a);
  const B = tokens(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  return inter / Math.min(A.size, B.size);
}

/**
 * Score N jobs against ONE candidate, returning the top K by score.
 * Used for the "Best matches for you" section on /jobs.
 *
 * Optimisation: we read the cache for all `jobIds` in one query, then
 * compute (and cache) only the misses. Misses are bounded to
 * MAX_LIVE_COMPUTES per request so a candidate landing on /jobs
 * without any cached scores doesn't trigger 50 sequential embed
 * calls — they'll see whichever scores happened to be cached and the
 * rest fill in on subsequent visits.
 */
const MAX_LIVE_COMPUTES_PER_REQUEST = 8;

export interface RankedJobMatch {
  jobId: string;
  score: number;
  breakdown: CandidateMatch["breakdown"];
  cached: boolean;
}

export async function rankJobsForCandidate(
  candidateId: string,
  jobIds: string[],
  topK = 5,
): Promise<RankedJobMatch[]> {
  if (jobIds.length === 0) return [];
  const now = new Date();
  const cached = await db.jobMatchCache.findMany({
    where: {
      candidateId,
      jobId: { in: jobIds },
      expiresAt: { gt: now },
    },
  });
  const byJob = new Map(cached.map((c) => [c.jobId, c]));
  const results: RankedJobMatch[] = [];
  // First pass — fold in everything we already had cached. Skip rows
  // whose breakdown JSON doesn't match the current schema (treat as
  // a miss — same recovery as the single-job path).
  for (const c of cached) {
    const parsed = breakdownSchema.safeParse(c.breakdown);
    if (!parsed.success) {
      byJob.delete(c.jobId); // force a recompute below
      continue;
    }
    results.push({
      jobId: c.jobId,
      score: c.score,
      breakdown: parsed.data,
      cached: true,
    });
  }
  // Second pass — compute the misses, capped so the request stays fast.
  const misses = jobIds.filter((id) => !byJob.has(id)).slice(0, MAX_LIVE_COMPUTES_PER_REQUEST);
  for (const jobId of misses) {
    const m = await getOrComputeCandidateMatch(candidateId, jobId);
    if (m) {
      results.push({ jobId, score: m.score, breakdown: m.breakdown, cached: false });
    }
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}
