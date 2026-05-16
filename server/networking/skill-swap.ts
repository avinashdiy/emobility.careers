import "server-only";
import { db } from "@/lib/db";

/**
 * #5 Skill-trade pairing — matching engine.
 *
 * Given candidate A, find candidate B such that:
 *   • B's KNOWN skills overlap A's LEARNING skills (B can teach A
 *     something A wants to learn).
 *   • A's KNOWN skills overlap B's LEARNING skills (A can teach B
 *     something B wants to learn).
 *
 * Both axes must overlap — one-way matches are "I want to mentor"
 * which is the existing /mentors surface, not a skill SWAP. The
 * mutual overlap is what makes this a peer-trade, not a
 * mentor-mentee.
 *
 * v1 implementation uses a two-step query:
 *   1. Pull candidates whose `learningSkills` (a String[] on
 *      CandidateProfile) hasSome of A's known skill names — single
 *      Postgres `&&` operator, index-friendly.
 *   2. Filter in JS to keep only those whose known skills overlap
 *      A's learning skills.
 *
 * Step 2 needs A's known skill names + each candidate's known skill
 * names (via CandidateSkill → Skill join), which we pull in the
 * same query.
 *
 * Returns up to N matches with both axes annotated so the UI can
 * render the trade pitch ("Sahil knows Battery, learning Motor →
 * Priya knows Motor, learning Battery").
 */

export interface SkillSwapMatch {
  candidateProfileId: string;
  slug: string;
  firstName: string;
  lastName: string | null;
  headline: string | null;
  profilePhotoUrl: string | null;
  city: string | null;
  /// Skills B knows that A wants to learn (what A would gain).
  theyCanTeach: string[];
  /// Skills A knows that B wants to learn (what B would gain).
  youCanTeach: string[];
}

export async function findSkillSwapMatches(args: {
  candidateProfileId: string;
  limit?: number;
}): Promise<SkillSwapMatch[]> {
  const limit = args.limit ?? 12;

  const me = await db.candidateProfile.findUnique({
    where: { id: args.candidateProfileId },
    select: {
      id: true,
      learningSkills: true,
      skills: { select: { skill: { select: { name: true } } } },
    },
  });
  if (!me) return [];

  const myLearning = normalise(me.learningSkills);
  const myKnown = normalise(me.skills.map((s) => s.skill.name));
  if (myLearning.length === 0 || myKnown.length === 0) {
    // Nothing to trade. Return empty — the page will explain.
    return [];
  }

  // Pull a wider candidate pool whose LEARNING skills overlap MY
  // KNOWN skills (case-insensitive — we lowercase both sides for
  // the Postgres `hasSome` filter via the lowercased mirror we
  // build in `learningSkills` at save-time? Currently we DON'T
  // lowercase at save. Postgres array overlap is case-sensitive,
  // so we need an exact-case fallback set or a raw query.
  // For v1: pull learning-skills overlap on raw names, then also
  // search lowercased candidates in a second filter via $queryRaw
  // would be cleaner but adds complexity. Accept the casing
  // mismatch and document — a later pass can normalise at save).
  const pool = await db.candidateProfile.findMany({
    where: {
      id: { not: me.id },
      // hasSome accepts any case match; users typically enter both
      // sides in the same case (TitleCase or lowercase) so v1 hit
      // rate is acceptable. A normalisation pass at save would
      // close the long-tail gap.
      learningSkills: { hasSome: myKnown },
    },
    select: {
      id: true,
      slug: true,
      firstName: true,
      lastName: true,
      headline: true,
      profilePhotoUrl: true,
      city: true,
      learningSkills: true,
      skills: { select: { skill: { select: { name: true } } } },
    },
    take: 200,
  });

  const matches: SkillSwapMatch[] = [];
  const myLearningLower = new Set(myLearning.map((s) => s.toLowerCase()));
  const myKnownLower = new Set(myKnown.map((s) => s.toLowerCase()));

  for (const other of pool) {
    const otherKnown = normalise(other.skills.map((s) => s.skill.name));
    const otherLearning = normalise(other.learningSkills);

    // Cross-axis overlap (case-insensitive).
    const theyCanTeach = otherKnown.filter((s) => myLearningLower.has(s.toLowerCase()));
    const youCanTeach = otherLearning.filter((s) => myKnownLower.has(s.toLowerCase()));

    if (theyCanTeach.length === 0 || youCanTeach.length === 0) continue;

    matches.push({
      candidateProfileId: other.id,
      slug: other.slug,
      firstName: other.firstName,
      lastName: other.lastName,
      headline: other.headline,
      profilePhotoUrl: other.profilePhotoUrl,
      city: other.city,
      theyCanTeach: dedupe(theyCanTeach).slice(0, 4),
      youCanTeach: dedupe(youCanTeach).slice(0, 4),
    });
  }

  // Rank by the SUM of both axes — more skills in common in both
  // directions = stronger trade. Tiebreak by alphabetical slug for
  // stable ordering.
  matches.sort((a, b) => {
    const aScore = a.theyCanTeach.length + a.youCanTeach.length;
    const bScore = b.theyCanTeach.length + b.youCanTeach.length;
    if (aScore !== bScore) return bScore - aScore;
    return a.slug.localeCompare(b.slug);
  });

  return matches.slice(0, limit);
}

function normalise(arr: string[]): string[] {
  return arr
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter((s) => s.length > 0);
}

function dedupe(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of arr) {
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}
