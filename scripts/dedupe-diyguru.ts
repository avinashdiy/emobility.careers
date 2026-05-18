/**
 * Dedupe + canonicalise every DIYguru row across Company and
 * Institution tables.
 *
 * Final state after running:
 *   • One Company row — slug `u-diyguru`, name "DIYguru".
 *     Public URL: /company/u-diyguru
 *     Purpose: employment / experience FKs (where someone worked).
 *
 *   • One Institution row — slug `emobility-academy-by-diyguru`,
 *     name "DIYguru eMobility Academy".
 *     Public URL: /institutions/emobility-academy-by-diyguru
 *     Purpose: education / certification / training FKs (where someone
 *     studied or trained).
 *
 *   • Every variant Company / Institution is merged into the canonical:
 *       - All FK references rewritten to the canonical row.
 *       - A SlugRedirect row added so the old URL 308s to canonical.
 *       - The variant is deleted.
 *
 * Idempotent — safe to re-run. The canonical rows are upserted first,
 * so re-running after the first pass just no-ops.
 *
 * Run with:
 *   node_modules/.bin/tsx --require ./workers/load-env.cjs scripts/dedupe-diyguru.ts
 */

import { PrismaClient, SlugRedirectEntityType, CompanyType } from "@prisma/client";

const db = new PrismaClient();

// ─── Canonical identity ───────────────────────────────────────
const CANONICAL_COMPANY_SLUG = "u-diyguru";
const CANONICAL_COMPANY_NAME = "DIYguru";
const CANONICAL_INSTITUTION_SLUG = "emobility-academy-by-diyguru";
const CANONICAL_INSTITUTION_NAME = "DIYguru eMobility Academy";

// ─── DIYguru name + slug detection ────────────────────────────
// Anything with "diyguru" in the slug or name (case-insensitive)
// counts as a variant. Hand-tested against the current dataset:
//   Companies:    diyguru-academy, diyguru-foundation
//   Institutions: diyguru-network, emobility-academy-by-diyguru
//                 (the last is the canonical — kept)

function isDiyguruText(s: string | null | undefined): boolean {
  if (!s) return false;
  return /diy\s*-?\s*guru/i.test(s);
}

// ─── FK column registry ───────────────────────────────────────
// One entry per table that has a FK to Company / Institution. Used
// by the migrate loop to update every reference in a single pass.
//
// Generated from:
//   awk '/^model / { model=$2 } /(companyId|hostCompanyId|institutionId) String/ { print model "." $1 }' \
//     prisma/schema.prisma | sort -u
//
// Plus Post.asCompanyId (alias FK) which the grep above misses.

interface FkEntry {
  /// Prisma model name (camelCase as on `db.<model>`)
  model: string;
  /// FK column name on the model
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

const INSTITUTION_FKS: FkEntry[] = [
  { model: "collegePlacementCell", column: "institutionId" },
  { model: "competitionRegistration", column: "institutionId" },
  { model: "education", column: "institutionId" },
];

// ─── Helpers ──────────────────────────────────────────────────

/** Rewrites every FK in `fks` from `fromId` → `toId`. */
async function migrateFks(fks: FkEntry[], fromId: string, toId: string): Promise<number> {
  let total = 0;
  for (const fk of fks) {
    // We use raw SQL because Prisma's typed updateMany requires the
    // model + field types at compile time, and we want to enumerate
    // 20+ tables in a loop without a type-acrobatics shim.
    //
    // The table name is the PascalCase form of the model name. We
    // resolve it from Prisma's _dmmf so a future schema rename
    // doesn't silently miss tables. Falls back to the camelCase →
    // PascalCase guess when dmmf isn't reachable.
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

    const res = await db.$executeRawUnsafe(
      `UPDATE "${tableName}" SET "${fk.column}" = $1 WHERE "${fk.column}" = $2`,
      toId,
      fromId,
    );
    if (res > 0) {
      console.log(`     ${tableName}.${fk.column}: ${res} row${res === 1 ? "" : "s"} → canonical`);
      total += res;
    }
  }
  return total;
}

/** Insert a 308 redirect from old slug → canonical slug. */
async function addRedirect(
  entityType: SlugRedirectEntityType,
  fromSlug: string,
  toSlug: string,
  reason: string,
): Promise<void> {
  if (fromSlug === toSlug) return; // no-op
  await db.slugRedirect.upsert({
    where: { entityType_fromSlug: { entityType, fromSlug } },
    create: { entityType, fromSlug, toSlug, reason },
    update: { toSlug, reason },
  });
  console.log(`     ↳ redirect: /${entityType.toLowerCase()}/${fromSlug} → /${entityType.toLowerCase()}/${toSlug}`);
}

// ─── Pass 1 — ensure canonical Company exists ─────────────────

async function ensureCanonicalCompany(): Promise<string> {
  console.log("\n🏢 Ensuring canonical Company …");

  // If it already exists, just normalise the display fields and exit.
  const existing = await db.company.findUnique({
    where: { slug: CANONICAL_COMPANY_SLUG },
    select: { id: true },
  });
  if (existing) {
    await db.company.update({
      where: { id: existing.id },
      data: {
        name: CANONICAL_COMPANY_NAME,
        description:
          "DIYguru — India's flagship EV academy and operator of emobility.careers. Use this single canonical Company entry for any DIYguru employment / internship / contract relationship.",
        verificationStatus: "VERIFIED",
        website: "https://diyguru.org",
        hqLocation: "New Delhi",
        companyType: CompanyType.CONSULTING,
      },
    });
    console.log(`   ✓ Canonical Company already exists (id=${existing.id})`);
    return existing.id;
  }

  // Try to repurpose an existing variant (preserves history, FKs,
  // candidate experience links). Prefer the largest variant (most FK
  // attachments) so we touch the fewest rows in the migrate pass.
  const variants = await db.company.findMany({
    where: {
      OR: [
        { slug: { contains: "diyguru" } },
        { name: { contains: "diyguru", mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      slug: true,
      name: true,
      _count: { select: { jobs: true, team: true, experienceLinks: true } },
    },
  });

  if (variants.length === 0) {
    // No variant exists either — create canonical from scratch.
    // We need an ownerUserId; pick the first ADMIN.
    const admin = await db.user.findFirst({
      where: { role: "ADMIN" },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    if (!admin) {
      throw new Error("No ADMIN user found — cannot create canonical Company.");
    }
    const created = await db.company.create({
      data: {
        slug: CANONICAL_COMPANY_SLUG,
        name: CANONICAL_COMPANY_NAME,
        description:
          "DIYguru — India's flagship EV academy and operator of emobility.careers.",
        verificationStatus: "VERIFIED",
        website: "https://diyguru.org",
        hqLocation: "New Delhi",
        companyType: CompanyType.CONSULTING,
        ownerUserId: admin.id,
        emailDomains: ["diyguru.org", "campus.diyguru.com"],
      },
      select: { id: true },
    });
    console.log(`   ✓ Canonical Company created from scratch (id=${created.id})`);
    return created.id;
  }

  // Pick the variant with the most FK attachments and promote it.
  variants.sort((a, b) => {
    const aTotal = a._count.jobs + a._count.team + a._count.experienceLinks;
    const bTotal = b._count.jobs + b._count.team + b._count.experienceLinks;
    return bTotal - aTotal;
  });
  const winner = variants[0]!;
  console.log(
    `   ✓ Promoting variant "${winner.name}" (${winner.slug}) → canonical (id=${winner.id})`,
  );
  await db.company.update({
    where: { id: winner.id },
    data: {
      slug: CANONICAL_COMPANY_SLUG,
      name: CANONICAL_COMPANY_NAME,
      description:
        "DIYguru — India's flagship EV academy and operator of emobility.careers. Use this single canonical Company entry for any DIYguru employment / internship / contract relationship.",
      verificationStatus: "VERIFIED",
      website: "https://diyguru.org",
      companyType: CompanyType.CONSULTING,
    },
  });
  await addRedirect(
    "COMPANY",
    winner.slug,
    CANONICAL_COMPANY_SLUG,
    `Promoted "${winner.name}" → canonical DIYguru company (2026-05-18 dedupe)`,
  );
  return winner.id;
}

// ─── Pass 2 — ensure canonical Institution exists ─────────────

async function ensureCanonicalInstitution(): Promise<string> {
  console.log("\n🎓 Ensuring canonical Institution …");

  const existing = await db.institution.findUnique({
    where: { slug: CANONICAL_INSTITUTION_SLUG },
    select: { id: true },
  });
  if (existing) {
    await db.institution.update({
      where: { id: existing.id },
      data: {
        name: CANONICAL_INSTITUTION_NAME,
        shortName: "DIYguru Academy",
        verificationStatus: "VERIFIED",
        website: "https://diyguru.org",
        country: "IN",
      },
    });
    console.log(`   ✓ Canonical Institution already exists (id=${existing.id})`);
    return existing.id;
  }

  const variants = await db.institution.findMany({
    where: {
      OR: [
        { slug: { contains: "diyguru" } },
        { name: { contains: "diyguru", mode: "insensitive" } },
        { slug: { contains: "emobility-academy" } },
      ],
    },
    select: {
      id: true,
      slug: true,
      name: true,
      _count: { select: { educationLinks: true } },
    },
  });

  if (variants.length === 0) {
    const created = await db.institution.create({
      data: {
        slug: CANONICAL_INSTITUTION_SLUG,
        name: CANONICAL_INSTITUTION_NAME,
        shortName: "DIYguru Academy",
        type: "TRAINING_CENTER",
        city: "New Delhi",
        state: "Delhi",
        country: "IN",
        website: "https://diyguru.org",
        verificationStatus: "VERIFIED",
        verifiedAt: new Date(),
      },
      select: { id: true },
    });
    console.log(`   ✓ Canonical Institution created from scratch (id=${created.id})`);
    return created.id;
  }

  variants.sort((a, b) => b._count.educationLinks - a._count.educationLinks);
  const winner = variants[0]!;
  console.log(
    `   ✓ Promoting variant "${winner.name}" (${winner.slug}) → canonical (id=${winner.id})`,
  );
  await db.institution.update({
    where: { id: winner.id },
    data: {
      slug: CANONICAL_INSTITUTION_SLUG,
      name: CANONICAL_INSTITUTION_NAME,
      shortName: "DIYguru Academy",
      type: "TRAINING_CENTER",
      city: "New Delhi",
      state: "Delhi",
      country: "IN",
      website: "https://diyguru.org",
      verificationStatus: "VERIFIED",
      verifiedAt: new Date(),
    },
  });
  await addRedirect(
    "INSTITUTION",
    winner.slug,
    CANONICAL_INSTITUTION_SLUG,
    `Promoted "${winner.name}" → canonical DIYguru institution (2026-05-18 dedupe)`,
  );
  return winner.id;
}

// ─── Pass 3 — merge every remaining variant ───────────────────

async function mergeCompanyVariants(canonicalId: string): Promise<void> {
  console.log("\n🔁 Merging Company variants …");
  const variants = await db.company.findMany({
    where: {
      AND: [
        { id: { not: canonicalId } },
        {
          OR: [
            { slug: { contains: "diyguru" } },
            { name: { contains: "diyguru", mode: "insensitive" } },
          ],
        },
      ],
    },
    select: { id: true, slug: true, name: true },
  });
  if (variants.length === 0) {
    console.log("   ✓ No variants to merge");
    return;
  }
  for (const v of variants) {
    if (!isDiyguruText(v.name) && !isDiyguruText(v.slug)) continue;
    console.log(`\n   ⤷ Merging "${v.name}" (${v.slug})`);
    const total = await migrateFks(COMPANY_FKS, v.id, canonicalId);
    console.log(`     ${total} FK row${total === 1 ? "" : "s"} re-pointed`);
    await addRedirect(
      "COMPANY",
      v.slug,
      CANONICAL_COMPANY_SLUG,
      `Merged variant "${v.name}" → canonical DIYguru company`,
    );
    try {
      await db.company.delete({ where: { id: v.id } });
      console.log(`     deleted`);
    } catch (err) {
      console.error(`     ✗ Could not delete (FK still attached?):`, err);
    }
  }
}

async function mergeInstitutionVariants(canonicalId: string): Promise<void> {
  console.log("\n🔁 Merging Institution variants …");
  const variants = await db.institution.findMany({
    where: {
      AND: [
        { id: { not: canonicalId } },
        {
          OR: [
            { slug: { contains: "diyguru" } },
            { name: { contains: "diyguru", mode: "insensitive" } },
            { slug: { contains: "emobility-academy" } },
          ],
        },
      ],
    },
    select: { id: true, slug: true, name: true },
  });
  if (variants.length === 0) {
    console.log("   ✓ No variants to merge");
    return;
  }
  for (const v of variants) {
    // Only merge things that genuinely match the DIYguru brand —
    // the search picks up "emobility-academy" because the canonical
    // slug contains it; we don't want to accidentally merge unrelated
    // rows that happen to contain "emobility".
    if (!isDiyguruText(v.name) && !isDiyguruText(v.slug)) continue;
    console.log(`\n   ⤷ Merging "${v.name}" (${v.slug})`);
    const total = await migrateFks(INSTITUTION_FKS, v.id, canonicalId);
    console.log(`     ${total} FK row${total === 1 ? "" : "s"} re-pointed`);
    await addRedirect(
      "INSTITUTION",
      v.slug,
      CANONICAL_INSTITUTION_SLUG,
      `Merged variant "${v.name}" → canonical DIYguru institution`,
    );
    try {
      await db.institution.delete({ where: { id: v.id } });
      console.log(`     deleted`);
    } catch (err) {
      console.error(`     ✗ Could not delete (FK still attached?):`, err);
    }
  }
}

// ─── Driver ───────────────────────────────────────────────────

async function main() {
  console.log("📦 DIYguru dedupe + canonicalisation");
  console.log("====================================");

  const companyId = await ensureCanonicalCompany();
  const institutionId = await ensureCanonicalInstitution();

  await mergeCompanyVariants(companyId);
  await mergeInstitutionVariants(institutionId);

  console.log("\n✅ Done.");
  console.log(`   Canonical Company    → /company/${CANONICAL_COMPANY_SLUG}`);
  console.log(`   Canonical Institution → /institutions/${CANONICAL_INSTITUTION_SLUG}`);
  console.log("\n   The picker + admin entity creators now reject new");
  console.log("   DIYguru variants — search-and-select is the only path.");
}

main()
  .catch((err) => {
    console.error("✗ DIYguru dedupe failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
