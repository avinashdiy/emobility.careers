/**
 * Dedupe known duplicate Institution rows.
 *
 * Hand-curated list of "same institution, two slugs" pairs found by
 * auditing seed.ts for name collisions. For each pair we promote one
 * slug as canonical (the one that's already on Wikipedia / matches
 * the institution's own domain) and merge the other into it:
 *
 *   1. Migrate every FK on the loser row to the winner.
 *   2. Insert a 308 SlugRedirect so the old URL doesn't 404.
 *   3. Delete the loser row.
 *
 * Idempotent — re-running after a successful pass no-ops because the
 * loser slugs are gone. Safe to ship as part of every deploy.
 *
 * Run with:
 *   pnpm exec tsx scripts/dedupe-institutions.ts
 */

import { PrismaClient, SlugRedirectEntityType } from "@prisma/client";

const db = new PrismaClient();

// ─── Duplicate pairs ──────────────────────────────────────────
// (winnerSlug, loserSlug, reason). winner = slug we keep.
//
// Rationale per pair:
//   asdc-india vs asdc-training         → asdc-india is shorter +
//                                         the brand's own URL slug.
//   cmu vs cmu-pittsburgh               → cmu-pittsburgh disambiguates
//                                         from CMU India / other CMUs.
//   tu-delft vs tudelft                 → tu-delft matches Wikipedia +
//                                         the university's own usage.
//   polimi vs politecnico-milano        → polimi matches their domain
//                                         polimi.it.
//   srmist-chennai vs srm-institute     → -chennai locates the campus,
//                                         and srm-institute is also
//                                         ambiguous (SRM has many).
//   tum-munich vs tu-munich             → tum matches their domain tum.de.
//   vit-pune vs vit-pune-college        → vit-pune is the institution's
//                                         own short form.

interface DupPair {
  winnerSlug: string;
  loserSlug: string;
  reason: string;
}

const PAIRS: DupPair[] = [
  {
    winnerSlug: "asdc-india",
    loserSlug: "asdc-training",
    reason: "Same Sector Skill Council — Automotive Skills Development Council. Canonical: asdc-india.",
  },
  {
    winnerSlug: "cmu-pittsburgh",
    loserSlug: "cmu",
    reason: "Same university — Carnegie Mellon, Pittsburgh. Canonical: cmu-pittsburgh (location-disambiguated).",
  },
  {
    winnerSlug: "tu-delft",
    loserSlug: "tudelft",
    reason: "Same university — Delft University of Technology. Canonical: tu-delft (matches Wikipedia + the school's own usage).",
  },
  {
    winnerSlug: "polimi",
    loserSlug: "politecnico-milano",
    reason: "Same university — Politecnico di Milano. Canonical: polimi (matches polimi.it).",
  },
  {
    winnerSlug: "srmist-chennai",
    loserSlug: "srm-institute",
    reason: "Same university — SRM Institute of Science and Technology, Chennai. Canonical: srmist-chennai (location-disambiguated; SRM Group has many institutions).",
  },
  {
    winnerSlug: "tum-munich",
    loserSlug: "tu-munich",
    reason: "Same university — Technical University of Munich. Canonical: tum-munich (matches tum.de + their own logo wordmark).",
  },
  {
    winnerSlug: "vit-pune",
    loserSlug: "vit-pune-college",
    reason: "Same college — Vishwakarma Institute of Technology, Pune. Canonical: vit-pune.",
  },
];

// ─── FK column registry ───────────────────────────────────────
// Generated from prisma/schema.prisma:
//   grep -E "(institutionId.*String|@relation.*Institution)" prisma/schema.prisma
//
// Keep in sync with dedupe-diyguru.ts.

interface FkEntry {
  model: string;
  column: string;
}

const INSTITUTION_FKS: FkEntry[] = [
  { model: "collegePlacementCell", column: "institutionId" },
  { model: "competitionRegistration", column: "institutionId" },
  { model: "education", column: "institutionId" },
  { model: "institutionReview", column: "institutionId" },
];

// ─── Helpers ──────────────────────────────────────────────────

async function migrateFks(fromId: string, toId: string): Promise<number> {
  let total = 0;
  for (const fk of INSTITUTION_FKS) {
    // Same approach as dedupe-diyguru.ts: raw SQL avoids needing to
    // hand-roll a typed updateMany for every table.
    let tableName: string | undefined;
    try {
      const dmmfModel = (db as unknown as {
        _baseDmmf?: { datamodel: { models: { name: string }[] } };
      })._baseDmmf?.datamodel.models.find(
        (m) => m.name.toLowerCase() === fk.model.toLowerCase(),
      );
      tableName = dmmfModel?.name;
    } catch {
      // ignore
    }
    if (!tableName) {
      tableName = fk.model.charAt(0).toUpperCase() + fk.model.slice(1);
    }

    try {
      const res = await db.$executeRawUnsafe(
        `UPDATE "${tableName}" SET "${fk.column}" = $1 WHERE "${fk.column}" = $2`,
        toId,
        fromId,
      );
      if (res > 0) {
        console.log(`     ${tableName}.${fk.column}: ${res} row${res === 1 ? "" : "s"} → canonical`);
        total += res;
      }
    } catch (err) {
      // Some FK tables only exist in newer schemas (e.g. InstitutionReview
      // was added later). Soft-skip if the table is missing.
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("does not exist")) {
        console.log(`     ${tableName}: (table not yet in DB, skipping)`);
      } else {
        throw err;
      }
    }
  }
  return total;
}

async function addRedirect(fromSlug: string, toSlug: string, reason: string): Promise<void> {
  if (fromSlug === toSlug) return;
  await db.slugRedirect.upsert({
    where: {
      entityType_fromSlug: {
        entityType: SlugRedirectEntityType.INSTITUTION,
        fromSlug,
      },
    },
    create: {
      entityType: SlugRedirectEntityType.INSTITUTION,
      fromSlug,
      toSlug,
      reason,
    },
    update: { toSlug, reason },
  });
  console.log(`     ↳ redirect: /institutions/${fromSlug} → /institutions/${toSlug}`);
}

/**
 * Merge richer fields from loser into winner before the loser row is
 * deleted. Only fill on winner if the field is NULL — never overwrite
 * an existing winner value, since the winner is the canonical record.
 */
async function preserveRicherFields(winnerId: string, loserId: string): Promise<void> {
  const [winner, loser] = await Promise.all([
    db.institution.findUnique({
      where: { id: winnerId },
      select: {
        about: true,
        researchOverview: true,
        placementOverview: true,
        researchCentres: true,
        oemCollaborations: true,
        ongoingResearch: true,
        programsOffered: true,
        notableAlumni: true,
        placementStats: true,
        topRecruiters: true,
        accreditations: true,
        facilities: true,
        industryPartnerships: true,
      },
    }),
    db.institution.findUnique({
      where: { id: loserId },
      select: {
        about: true,
        researchOverview: true,
        placementOverview: true,
        researchCentres: true,
        oemCollaborations: true,
        ongoingResearch: true,
        programsOffered: true,
        notableAlumni: true,
        placementStats: true,
        topRecruiters: true,
        accreditations: true,
        facilities: true,
        industryPartnerships: true,
      },
    }),
  ]);

  if (!winner || !loser) return;

  const updates: Record<string, unknown> = {};
  if (!winner.about && loser.about) updates.about = loser.about;
  if (!winner.researchOverview && loser.researchOverview) updates.researchOverview = loser.researchOverview;
  if (!winner.placementOverview && loser.placementOverview) updates.placementOverview = loser.placementOverview;
  if (!winner.researchCentres && loser.researchCentres) updates.researchCentres = loser.researchCentres;
  if (!winner.oemCollaborations && loser.oemCollaborations) updates.oemCollaborations = loser.oemCollaborations;
  if (!winner.ongoingResearch && loser.ongoingResearch) updates.ongoingResearch = loser.ongoingResearch;
  if (!winner.programsOffered && loser.programsOffered) updates.programsOffered = loser.programsOffered;
  if (!winner.notableAlumni && loser.notableAlumni) updates.notableAlumni = loser.notableAlumni;
  if (!winner.placementStats && loser.placementStats) updates.placementStats = loser.placementStats;

  // String[] arrays — concat + dedupe so we don't lose either side's chips.
  const merge = (a: string[] | undefined, b: string[] | undefined) =>
    Array.from(new Set([...(a ?? []), ...(b ?? [])]));
  const mergedRecruiters = merge(winner.topRecruiters, loser.topRecruiters);
  const mergedAccreds = merge(winner.accreditations, loser.accreditations);
  const mergedFacilities = merge(winner.facilities, loser.facilities);
  const mergedPartnerships = merge(winner.industryPartnerships, loser.industryPartnerships);
  if (mergedRecruiters.length > winner.topRecruiters.length) updates.topRecruiters = mergedRecruiters;
  if (mergedAccreds.length > winner.accreditations.length) updates.accreditations = mergedAccreds;
  if (mergedFacilities.length > winner.facilities.length) updates.facilities = mergedFacilities;
  if (mergedPartnerships.length > winner.industryPartnerships.length) updates.industryPartnerships = mergedPartnerships;

  if (Object.keys(updates).length > 0) {
    await db.institution.update({ where: { id: winnerId }, data: updates });
    console.log(`     ↳ preserved ${Object.keys(updates).length} richer field${Object.keys(updates).length === 1 ? "" : "s"} from loser`);
  }
}

// ─── Driver ───────────────────────────────────────────────────

async function dedupeOnePair(pair: DupPair): Promise<void> {
  console.log(`\n⤷ ${pair.loserSlug} → ${pair.winnerSlug}`);

  const [winner, loser] = await Promise.all([
    db.institution.findUnique({
      where: { slug: pair.winnerSlug },
      select: { id: true, name: true },
    }),
    db.institution.findUnique({
      where: { slug: pair.loserSlug },
      select: { id: true, name: true },
    }),
  ]);

  if (!loser) {
    console.log(`   ✓ Already deduped (no loser "${pair.loserSlug}" in DB)`);
    return;
  }
  if (!winner) {
    console.warn(`   ⚠ Winner "${pair.winnerSlug}" missing in DB — skipping pair.`);
    return;
  }

  await preserveRicherFields(winner.id, loser.id);

  const total = await migrateFks(loser.id, winner.id);
  console.log(`   ${total} FK row${total === 1 ? "" : "s"} re-pointed`);

  await addRedirect(pair.loserSlug, pair.winnerSlug, pair.reason);

  try {
    await db.institution.delete({ where: { id: loser.id } });
    console.log(`   ✓ Deleted loser`);
  } catch (err) {
    console.error(`   ✗ Could not delete loser — FK still attached?`, err);
  }
}

async function main() {
  console.log("📦 Institution dedupe");
  console.log("=====================");

  for (const pair of PAIRS) {
    await dedupeOnePair(pair);
  }

  console.log("\n✅ Done.");
  console.log(`   ${PAIRS.length} duplicate pairs collapsed (or already canonical).`);
}

main()
  .catch((err) => {
    console.error("✗ Institution dedupe failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
