import { db } from "@/lib/db";
import { embed, jobEmbeddingText, profileEmbeddingText } from "@/lib/ai/embeddings";

export interface MatchedCandidate {
  candidateId: string;
  slug: string;
  firstName: string;
  lastName: string | null;
  headline: string | null;
  profilePhotoUrl: string | null;
  isDIYguruVerified: boolean;
  openToWork: boolean;
  hiringNow: boolean;
  totalExperienceMonths: number;
  location: string | null;
  vectorScore: number;        // 0..1
  skillScore: number;         // 0..1
  domainScore: number;        // 0..1
  diyguruBoost: number;       // 0..0.1
  finalScore: number;         // weighted total 0..1
  matchedSkills: string[];
}

interface MatchOptions {
  jobId: string;
  limit?: number;
  diyguruOnly?: boolean;
  openToWorkOnly?: boolean;
}

/**
 * Hybrid scoring:
 *   - 50% vector similarity (cosine) between job and candidate embeddings
 *   - 25% skill overlap (Jaccard) on canonical skill IDs
 *   - 15% EV-domain overlap
 *   - 10% DIYguru boost (the existing WP plugin used +20/+10; we cap at 10%)
 *
 * Falls back gracefully if embeddings haven't been generated yet (vector score = 0).
 */
export async function matchCandidatesForJob(opts: MatchOptions): Promise<MatchedCandidate[]> {
  const limit = opts.limit ?? 50;

  const job = await db.jobPosting.findUnique({
    where: { id: opts.jobId },
    include: {
      skills: { include: { skill: true } },
      evDomains: { include: { evDomain: true } },
      company: true,
    },
  });
  if (!job) return [];

  // Build / refresh JD embedding text on the fly so we can compare even if the
  // job's stored vector is stale or missing.
  const jobText = jobEmbeddingText(job);
  let jobVector: number[] | null = null;
  try {
    if (process.env.OPENAI_API_KEY) {
      jobVector = await embed(jobText);
    }
  } catch {
    jobVector = null;
  }

  const requiredSkillIds = new Set(job.skills.filter((s) => s.required).map((s) => s.skillId));
  const allJobSkillIds = new Set(job.skills.map((s) => s.skillId));
  const jobDomainIds = new Set(job.evDomains.map((d) => d.evDomainId));

  // Candidate pool: respect visibility, basic stage filters
  const candidates = await db.candidateProfile.findMany({
    where: {
      cvVisibility: { in: ["EVERYONE", "EMPLOYERS_ONLY"] },
      ...(opts.openToWorkOnly && { openToWork: true }),
      ...(opts.diyguruOnly && { isDIYguruVerified: true }),
      profileMode: job.profileMode,
    },
    take: 500, // first-pass cap before ranking
    include: {
      skills: { select: { skillId: true, skill: { select: { name: true } } } },
      evDomains: { select: { evDomainId: true } },
    },
  });

  // Vector scores: query pgvector once for the top-N most similar profiles.
  // The embedding is validated as pure numbers before being formatted into SQL.
  let vectorScores = new Map<string, number>();
  if (
    jobVector &&
    Array.isArray(jobVector) &&
    jobVector.every((v) => typeof v === "number" && Number.isFinite(v))
  ) {
    try {
      const literal = `[${jobVector.join(",")}]`;
      const rows = await db.$queryRaw<Array<{ id: string; score: number }>>`
        SELECT id, 1 - ("profileEmbedding" <=> ${literal}::vector) AS score
        FROM "CandidateProfile"
        WHERE "profileEmbedding" IS NOT NULL
        ORDER BY "profileEmbedding" <=> ${literal}::vector
        LIMIT 500
      `;
      vectorScores = new Map(rows.map((r) => [r.id, Number(r.score)]));
    } catch {
      vectorScores = new Map();
    }
  }

  const scored: MatchedCandidate[] = candidates.map((c) => {
    const candidateSkillIds = new Set(c.skills.map((s) => s.skillId));
    const candidateDomainIds = new Set(c.evDomains.map((d) => d.evDomainId));

    // Skill overlap = (required-met-ratio * 0.7) + (any-skill-jaccard * 0.3)
    const requiredMatched = [...requiredSkillIds].filter((id) => candidateSkillIds.has(id)).length;
    const requiredRatio = requiredSkillIds.size === 0 ? 1 : requiredMatched / requiredSkillIds.size;
    const allUnion = new Set([...allJobSkillIds, ...candidateSkillIds]);
    const allInter = [...allJobSkillIds].filter((id) => candidateSkillIds.has(id)).length;
    const jaccard = allUnion.size === 0 ? 0 : allInter / allUnion.size;
    const skillScore = requiredRatio * 0.7 + jaccard * 0.3;

    // Domain overlap = jaccard
    const domUnion = new Set([...jobDomainIds, ...candidateDomainIds]);
    const domInter = [...jobDomainIds].filter((id) => candidateDomainIds.has(id)).length;
    const domainScore = domUnion.size === 0 ? 0.5 : domInter / domUnion.size;

    const vectorScore = vectorScores.get(c.id) ?? 0;
    const diyguruBoost = c.isDIYguruVerified ? 0.1 : 0;

    const finalScore =
      vectorScore * 0.5 + skillScore * 0.25 + domainScore * 0.15 + diyguruBoost;

    const matchedSkills = c.skills
      .filter((s) => allJobSkillIds.has(s.skillId))
      .map((s) => s.skill.name);

    return {
      candidateId: c.id,
      slug: c.slug,
      firstName: c.firstName,
      lastName: c.lastName,
      headline: c.headline,
      profilePhotoUrl: c.profilePhotoUrl,
      isDIYguruVerified: c.isDIYguruVerified,
      openToWork: c.openToWork,
      hiringNow: c.hiringNow,
      totalExperienceMonths: c.totalExperienceMonths,
      location: c.location,
      vectorScore,
      skillScore,
      domainScore,
      diyguruBoost,
      finalScore: Math.min(1, finalScore),
      matchedSkills,
    };
  });

  scored.sort((a, b) => b.finalScore - a.finalScore);
  return scored.slice(0, limit);
}

/**
 * Build a one-line "candidate brief" string for use in the GPT-4o rerank.
 */
export async function buildCandidateBriefs(candidateIds: string[]): Promise<Map<string, string>> {
  if (candidateIds.length === 0) return new Map();
  const profiles = await db.candidateProfile.findMany({
    where: { id: { in: candidateIds } },
    include: {
      skills: { include: { skill: true } },
      experiences: { take: 3, orderBy: { startDate: "desc" } },
      evDomains: { include: { evDomain: true } },
    },
  });
  return new Map(profiles.map((p) => [p.id, profileEmbeddingText(p).slice(0, 800)]));
}

/**
 * Persist match scores onto the Application rows for a job — fired after
 * pipeline movements or as an admin trigger.
 */
export async function refreshApplicationMatchScores(jobId: string): Promise<void> {
  const matches = await matchCandidatesForJob({ jobId, limit: 1000 });
  const byId = new Map(matches.map((m) => [m.candidateId, m]));

  const apps = await db.application.findMany({
    where: { jobId },
    select: { id: true, candidateId: true },
  });
  const updates = apps.flatMap((a) => {
    const m = byId.get(a.candidateId);
    if (!m) return [];
    return [
      db.application.update({
        where: { id: a.id },
        data: {
          matchScore: m.finalScore,
          matchExplanation: {
            vectorScore: m.vectorScore,
            skillScore: m.skillScore,
            domainScore: m.domainScore,
            diyguruBoost: m.diyguruBoost,
            matchedSkills: m.matchedSkills,
          },
        },
      }),
    ];
  });
  if (updates.length === 0) return;
  // Chunk transactions to keep each batch under the default Prisma timeout.
  const CHUNK = 200;
  for (let i = 0; i < updates.length; i += CHUNK) {
    await db.$transaction(updates.slice(i, i + CHUNK));
  }
}
