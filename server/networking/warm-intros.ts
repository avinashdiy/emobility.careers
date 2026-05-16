import "server-only";
import { db } from "@/lib/db";

/**
 * #3 Warm-intro graph — engine.
 *
 * Given (candidate A, target company), find candidates B such that:
 *   • B has an Experience at that company (current OR past)
 *   • B shares at least one Education institution with A
 *   • B's profile is reachable (cvVisibility ≠ PRIVATE)
 *
 * The bridge is the alumni network. Candidates who studied at the
 * same college and now work at the target company are the warmest
 * intro path — they're statistically more likely to respond than
 * a cold LinkedIn message because of the shared identity.
 *
 * v1 prefers structured matches (institutionId join) over free-text
 * name match because institutionIds are normalised + verified.
 * Free-text fallback catches the long tail (candidates whose
 * Education row is unstructured) but ranks below structured hits.
 *
 * Returns up to N suggestions with shared-institution context so
 * the UI can render the bridge pitch: "Aarav graduated from your
 * college and is now at Ather — want a 5-min chat?"
 */

export interface WarmIntroSuggestion {
  candidateProfileId: string;
  slug: string;
  firstName: string;
  lastName: string | null;
  headline: string | null;
  profilePhotoUrl: string | null;
  /// Name of the institution forming the alumni bridge. Displayed
  /// in the pitch so the candidate knows why this alum was
  /// surfaced.
  bridgeInstitution: string;
  /// Their current job title at the target company (if available).
  /// Lets the pitch read "Aarav, BMS Engineer at Ather, graduated
  /// from your college".
  roleAtCompany: string | null;
  /// True when the match was structured (institutionId on both
  /// sides). False = free-text name match. Used by the UI to mark
  /// stronger matches first.
  isStructuredMatch: boolean;
}

export async function findWarmIntros(args: {
  forCandidateId: string;
  companyId: string;
  limit?: number;
}): Promise<WarmIntroSuggestion[]> {
  const limit = args.limit ?? 4;

  const me = await db.candidateProfile.findUnique({
    where: { id: args.forCandidateId },
    select: {
      id: true,
      userId: true,
      education: {
        select: { institutionId: true, institution: true },
      },
    },
  });
  if (!me) return [];

  const myInstitutionIds = me.education
    .map((e) => e.institutionId)
    .filter((id): id is string => id !== null);
  const myInstitutionNames = me.education
    .map((e) => normalise(e.institution))
    .filter((n) => n.length >= 4);

  if (myInstitutionIds.length === 0 && myInstitutionNames.length === 0) {
    // No alumni network to leverage — can't form a bridge.
    return [];
  }

  // Pull candidates who have Experience at the target company AND
  // share at least one institution with us. Done as a single query
  // with OR'd bridge conditions. Strategy:
  //
  //   1. If we have ANY institutionIds (structured match), prefer
  //      that branch exclusively — the structured path uses
  //      `Education @@index([institutionId])` and resolves cleanly.
  //      Free-text matching is a fall-back for candidates whose
  //      Education row is unstructured, but it forces a
  //      case-insensitive scan on `Education.institution` (no
  //      LOWER() functional index exists), which gets expensive at
  //      scale.
  //   2. Only fall back to the free-text branch when we have ZERO
  //      structured ids (e.g. a fresh candidate whose Education
  //      rows are all free-text).
  //
  // Pre-fix we OR'd both branches with a `__never__` placeholder
  // when one array was empty — functionally correct but emitted a
  // dead OR clause Postgres still planned, polluting EXPLAIN.
  const institutionWhere =
    myInstitutionIds.length > 0
      ? { institutionId: { in: myInstitutionIds } }
      : { institution: { in: myInstitutionNames, mode: "insensitive" as const } };

  const pool = await db.candidateProfile.findMany({
    where: {
      id: { not: me.id },
      // Candidate must be reachable. PRIVATE profiles are explicitly
      // opted out of being discovered this way.
      cvVisibility: { not: "PRIVATE" },
      experiences: {
        some: { companyId: args.companyId },
      },
      education: { some: institutionWhere },
    },
    select: {
      id: true,
      slug: true,
      firstName: true,
      lastName: true,
      headline: true,
      profilePhotoUrl: true,
      education: {
        select: {
          institutionId: true,
          institution: true,
          institutionRef: { select: { name: true } },
        },
      },
      experiences: {
        where: { companyId: args.companyId },
        orderBy: { startDate: "desc" },
        take: 1,
        select: { title: true },
      },
    },
    take: 60,
  });

  const myInstNameSet = new Set(myInstitutionNames.map((n) => n.toLowerCase()));
  const myInstIdSet = new Set(myInstitutionIds);

  const ranked: WarmIntroSuggestion[] = [];
  for (const c of pool) {
    // Find the bridging institution. Prefer the structured match.
    let bridge: string | null = null;
    let structured = false;
    for (const edu of c.education) {
      if (edu.institutionId && myInstIdSet.has(edu.institutionId)) {
        bridge = edu.institutionRef?.name ?? edu.institution;
        structured = true;
        break;
      }
      const nameNorm = normalise(edu.institution).toLowerCase();
      if (nameNorm && myInstNameSet.has(nameNorm)) {
        bridge = edu.institution;
        // Don't break — a structured match downstream still wins.
      }
    }
    if (!bridge) continue;

    ranked.push({
      candidateProfileId: c.id,
      slug: c.slug,
      firstName: c.firstName,
      lastName: c.lastName,
      headline: c.headline,
      profilePhotoUrl: c.profilePhotoUrl,
      bridgeInstitution: bridge,
      roleAtCompany: c.experiences[0]?.title ?? null,
      isStructuredMatch: structured,
    });
  }

  ranked.sort((a, b) => {
    // Structured matches first (institutionId joins).
    if (a.isStructuredMatch !== b.isStructuredMatch) {
      return a.isStructuredMatch ? -1 : 1;
    }
    return a.firstName.localeCompare(b.firstName);
  });

  return ranked.slice(0, limit);
}

function normalise(s: string | null | undefined): string {
  return (s ?? "").trim();
}
