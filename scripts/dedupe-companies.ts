/**
 * Dedupe known duplicate Company rows.
 *
 * Hand-curated list of "same brand, two slugs" pairs found by
 * auditing seed.ts for name collisions. For each pair we promote one
 * slug as canonical (the one matching the brand's own domain / the
 * shortest unambiguous form) and merge the other into it:
 *
 *   1. Preserve richer fields (about, description) from loser → winner
 *      if winner is thinner.
 *   2. Migrate every FK on the loser row to the winner.
 *   3. Insert a 308 SlugRedirect so the old URL doesn't 404.
 *   4. Delete the loser row.
 *
 * Idempotent — re-running after a successful pass no-ops because the
 * loser slugs are gone. Safe to ship as part of every deploy.
 *
 * Mirrors scripts/dedupe-institutions.ts — same approach, different
 * FK column list.
 *
 * Run with:
 *   pnpm exec tsx scripts/dedupe-companies.ts
 */

import { PrismaClient, SlugRedirectEntityType } from "@prisma/client";

const db = new PrismaClient();

// ─── Duplicate pairs ──────────────────────────────────────────
// (winnerSlug, loserSlug, reason). winner = slug we keep.
//
// Rationale per pair: the winner is the slug whose seed.ts row carries
// the richer prose (about + description). Keeping the descriptive
// content as-is is more valuable than picking the shorter slug — the
// redirect handles the URL aliasing either way.
//
//   abb-india                       vs abb-india-ev                  → abb-india has the about + rich block.
//   adani-totalenergies-emobility   vs adani-totalenergies           → -emobility has the about; bulk thin row had no description detail.
//   hpcl-ev-charging                vs hpcl-ev                       → -charging has the about.
//   lime-mobility                   vs lime-electric                 → -mobility has the rich Lime block; "lime-electric" was a thin bulk row.
//   servotech                       vs servotech-power               → bare "servotech" has the rich about; "servotech-power" was the thin bulk row.
//   tritium-charging                vs tritium                       → -charging has the rich about; "tritium" was the thin bulk row.

interface DupPair {
  winnerSlug: string;
  loserSlug: string;
  reason: string;
}

const PAIRS: DupPair[] = [
  {
    winnerSlug: "abb-india",
    loserSlug: "abb-india-ev",
    reason: "Same company — ABB India (E-mobility). Canonical: abb-india (carries the rich about + tech-stack detail).",
  },
  {
    winnerSlug: "adani-totalenergies-emobility",
    loserSlug: "adani-totalenergies",
    reason: "Same JV — Adani TotalEnergies E-Mobility. Canonical: adani-totalenergies-emobility (carries the rich about; the short slug was the thin bulk-import row).",
  },
  {
    winnerSlug: "hpcl-ev-charging",
    loserSlug: "hpcl-ev",
    reason: "Same business unit — HPCL EV Charging. Canonical: hpcl-ev-charging (carries the rich about).",
  },
  {
    winnerSlug: "lime-mobility",
    loserSlug: "lime-electric",
    reason: "Same brand — Lime. Canonical: lime-mobility (carries the rich about with Gen4 fleet detail).",
  },
  {
    winnerSlug: "servotech",
    loserSlug: "servotech-power",
    reason: "Same company — Servotech Power Systems Ltd. Canonical: servotech (carries the rich about with charger-format breakdown).",
  },
  {
    winnerSlug: "tritium-charging",
    loserSlug: "tritium",
    reason: "Same brand — Tritium DCFC. Canonical: tritium-charging (carries the rich about; the short slug was the thin bulk-import row).",
  },
];

// ─── FK column registry ───────────────────────────────────────
// Generated from prisma/schema.prisma:
//   awk '/^model / {model=$2} /(companyId|asCompanyId|hostCompanyId) String/ {
//     print model "." $1
//   }' prisma/schema.prisma | sort -u
//
// Keep in sync with dedupe-diyguru.ts.

interface FkEntry {
  model: string;
  column: string;
}

const COMPANY_FKS: FkEntry[] = [
  { model: "apiKey", column: "companyId" },
  { model: "campusDrive", column: "companyId" },
  { model: "companyClaim", column: "companyId" },
  { model: "companyReview", column: "companyId" },
  { model: "competition", column: "hostCompanyId" },
  { model: "customPipelineStage", column: "companyId" },
  { model: "employerAward", column: "companyId" },
  { model: "employerProfile", column: "companyId" },
  { model: "event", column: "companyId" },
  { model: "experience", column: "companyId" },
  { model: "jobPosting", column: "companyId" },
  { model: "outreachCadence", column: "companyId" },
  { model: "pipelineAutomation", column: "companyId" },
  { model: "post", column: "asCompanyId" },
  { model: "recruitmentDriveCompany", column: "companyId" },
  { model: "recruitmentDriveJob", column: "companyId" },
  { model: "sLAConfig", column: "companyId" },
  { model: "salarySubmission", column: "companyId" },
  { model: "subscription", column: "companyId" },
  { model: "teamInvite", column: "companyId" },
  { model: "webhook", column: "companyId" },
  { model: "webhookEvent", column: "companyId" },
];

// ─── Helpers ──────────────────────────────────────────────────

async function migrateFks(fromId: string, toId: string): Promise<number> {
  let total = 0;
  for (const fk of COMPANY_FKS) {
    // Same approach as dedupe-diyguru.ts / dedupe-institutions.ts:
    // raw SQL avoids needing to hand-roll a typed updateMany for
    // every table.
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
      // Some FK tables only exist in newer schemas. Soft-skip if the
      // table is missing.
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
        entityType: SlugRedirectEntityType.COMPANY,
        fromSlug,
      },
    },
    create: {
      entityType: SlugRedirectEntityType.COMPANY,
      fromSlug,
      toSlug,
      reason,
    },
    update: { toSlug, reason },
  });
  console.log(`     ↳ redirect: /company/${fromSlug} → /company/${toSlug}`);
}

/**
 * Merge richer fields from loser into winner before the loser row is
 * deleted. Only fill on winner if the field is NULL / empty — never
 * overwrite an existing winner value, since the winner is the canonical
 * record.
 */
async function preserveRicherFields(winnerId: string, loserId: string): Promise<void> {
  const [winner, loser] = await Promise.all([
    db.company.findUnique({
      where: { id: winnerId },
      select: {
        about: true,
        description: true,
        website: true,
        hqLocation: true,
        foundedYear: true,
        teamSize: true,
        linkedinUrl: true,
        twitterUrl: true,
        facebookUrl: true,
        emailDomains: true,
        evDomains: true,
        techStack: true,
        benefits: true,
        galleryUrls: true,
      },
    }),
    db.company.findUnique({
      where: { id: loserId },
      select: {
        about: true,
        description: true,
        website: true,
        hqLocation: true,
        foundedYear: true,
        teamSize: true,
        linkedinUrl: true,
        twitterUrl: true,
        facebookUrl: true,
        emailDomains: true,
        evDomains: true,
        techStack: true,
        benefits: true,
        galleryUrls: true,
      },
    }),
  ]);

  if (!winner || !loser) return;

  const updates: Record<string, unknown> = {};
  // Scalar fields — fill on winner if NULL.
  if (!winner.about && loser.about) updates.about = loser.about;
  if (!winner.description && loser.description) updates.description = loser.description;
  if (!winner.website && loser.website) updates.website = loser.website;
  if (!winner.hqLocation && loser.hqLocation) updates.hqLocation = loser.hqLocation;
  if (!winner.foundedYear && loser.foundedYear) updates.foundedYear = loser.foundedYear;
  if (!winner.teamSize && loser.teamSize) updates.teamSize = loser.teamSize;
  if (!winner.linkedinUrl && loser.linkedinUrl) updates.linkedinUrl = loser.linkedinUrl;
  if (!winner.twitterUrl && loser.twitterUrl) updates.twitterUrl = loser.twitterUrl;
  if (!winner.facebookUrl && loser.facebookUrl) updates.facebookUrl = loser.facebookUrl;

  // String[] arrays — concat + dedupe so we don't lose either side's items.
  const merge = (a: string[] | undefined, b: string[] | undefined) =>
    Array.from(new Set([...(a ?? []), ...(b ?? [])]));
  const mergedEmails = merge(winner.emailDomains, loser.emailDomains);
  const mergedEvDomains = merge(winner.evDomains, loser.evDomains);
  const mergedTech = merge(winner.techStack, loser.techStack);
  const mergedBenefits = merge(winner.benefits, loser.benefits);
  const mergedGallery = merge(winner.galleryUrls, loser.galleryUrls);
  if (mergedEmails.length > winner.emailDomains.length) updates.emailDomains = mergedEmails;
  if (mergedEvDomains.length > winner.evDomains.length) updates.evDomains = mergedEvDomains;
  if (mergedTech.length > winner.techStack.length) updates.techStack = mergedTech;
  if (mergedBenefits.length > winner.benefits.length) updates.benefits = mergedBenefits;
  if (mergedGallery.length > winner.galleryUrls.length) updates.galleryUrls = mergedGallery;

  if (Object.keys(updates).length > 0) {
    await db.company.update({ where: { id: winnerId }, data: updates });
    console.log(`     ↳ preserved ${Object.keys(updates).length} richer field${Object.keys(updates).length === 1 ? "" : "s"} from loser`);
  }
}

// ─── Driver ───────────────────────────────────────────────────

async function dedupeOnePair(pair: DupPair): Promise<void> {
  console.log(`\n⤷ ${pair.loserSlug} → ${pair.winnerSlug}`);

  const [winner, loser] = await Promise.all([
    db.company.findUnique({
      where: { slug: pair.winnerSlug },
      select: { id: true, name: true },
    }),
    db.company.findUnique({
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
    await db.company.delete({ where: { id: loser.id } });
    console.log(`   ✓ Deleted loser`);
  } catch (err) {
    console.error(`   ✗ Could not delete loser — FK still attached?`, err);
  }
}

async function main() {
  console.log("📦 Company dedupe");
  console.log("=================");

  for (const pair of PAIRS) {
    await dedupeOnePair(pair);
  }

  console.log("\n✅ Done.");
  console.log(`   ${PAIRS.length} duplicate pairs collapsed (or already canonical).`);
}

main()
  .catch((err) => {
    console.error("✗ Company dedupe failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
