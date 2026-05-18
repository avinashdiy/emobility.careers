/**
 * Fill missing "basics" on every Company row so no /company/[slug]
 * page ever renders with empty headline fields.
 *
 * Mirrors scripts/seed-institution-basics.ts.
 *
 * What this script writes:
 *   • about         — generated from a deterministic template that
 *                     weaves name + companyType + hqLocation +
 *                     foundedYear + description. Skipped if the row
 *                     already has an about (idempotent).
 *   • companyTier   — defaulted from companyType when NULL
 *                     (OEM → OEM, BATTERY/TIER1/TIER2 → TIER1_SUPPLIER,
 *                     CHARGING/FLEET → CHARGING_OPERATOR,
 *                     STARTUP → STARTUP, CONSULTING → CONSULTING,
 *                     OTHER → OTHER).
 *   • hqLocation    — normalised so Indian rows get a ", India"
 *                     suffix if missing. Drives the address chip on
 *                     the hero card looking complete.
 *   • linkedinUrl   — heuristic-guessed from slug when NULL
 *                     (https://www.linkedin.com/company/<slug>). Real
 *                     LinkedIn URLs from the enrichment batches win
 *                     because we only fill when NULL.
 *   • foundedYear   — defaulted to NULL only if the row truly has no
 *                     enrichment + no seed value. We don't invent
 *                     foundedYear — leaving it NULL is more honest
 *                     than guessing.
 *
 * What this script intentionally does NOT do:
 *   • Web-scrape 1,197 companies. That would be brittle + slow + hit
 *     rate limits.
 *   • Overwrite admin / enrichment values. Skipped if any value set.
 *   • Touch logoUrl / bannerUrl / galleryUrls — those need explicit
 *     admin uploads (handled in the admin UI).
 *
 * Run with:
 *   pnpm exec tsx scripts/seed-company-basics.ts
 */

import { PrismaClient, CompanyType, CompanyTier } from "@prisma/client";

const db = new PrismaClient();

// ─── companyType → companyTier default ───────────────────────

function defaultTier(t: CompanyType): CompanyTier {
  switch (t) {
    case CompanyType.OEM:
      return CompanyTier.OEM;
    case CompanyType.BATTERY:
    case CompanyType.TIER1:
      return CompanyTier.TIER1_SUPPLIER;
    case CompanyType.TIER2:
      return CompanyTier.TIER2_SUPPLIER;
    case CompanyType.CHARGING:
    case CompanyType.FLEET:
      return CompanyTier.CHARGING_OPERATOR;
    case CompanyType.STARTUP:
      return CompanyTier.STARTUP;
    case CompanyType.CONSULTING:
      return CompanyTier.CONSULTING;
    case CompanyType.OTHER:
    default:
      return CompanyTier.OTHER;
  }
}

// ─── hqLocation country-normalisation ─────────────────────────
// Most seed rows store hqLocation as just "Bengaluru" / "Pune" /
// "Mumbai" without a country. The hero card looks more complete when
// the chip reads "Pune, India" — same convention the institution
// page uses.

const INDIAN_CITIES = new Set([
  "ahmedabad", "akurdi", "ahmednagar", "ajmer", "amaravati", "amritsar",
  "anand", "anantapur", "aurangabad", "bahadurgarh", "bangalore",
  "basar", "bengaluru", "bhagalpur", "bhiwadi", "bhopal", "bhubaneswar",
  "bidadi", "chakan", "chandigarh", "chennai", "coimbatore", "cuttack",
  "davangere", "dehradun", "delhi", "dharuhera", "dharwad", "ennore",
  "faridabad", "gandhinagar", "gangtok", "gaya", "ghaziabad",
  "goa", "greater noida", "gurgaon", "gurugram", "guwahati", "halol",
  "haridwar", "hisar", "hosur", "howrah", "hubli", "hyderabad",
  "indore", "imphal", "itanagar", "jabalpur", "jaipur", "jalandhar",
  "jamnagar", "jamshedpur", "jodhpur", "kalamassery", "kanpur",
  "karnal", "kattankulathur", "kochi", "kolhapur", "kolkata", "kota",
  "lucknow", "ludhiana", "madurai", "manesar", "mangaluru", "manipal",
  "mathura", "mehsana", "meerut", "mohali", "mumbai", "muzaffarpur",
  "mysuru", "mysore", "nagpur", "nashik", "neemrana", "new delhi",
  "noida", "oragadam", "pantnagar", "panaji", "panipat", "patna",
  "pithampur", "pondicherry", "pune", "raipur", "rajkot", "ranchi",
  "ranipet", "rewari", "rohtak", "roorkee", "rourkela", "rudrapur",
  "salem", "sanand", "sangli", "satara", "secunderabad", "shillong",
  "sikar", "siliguri", "sonipat", "sriperumbudur", "surat", "tapukara",
  "thanjavur", "thiruvananthapuram", "thrissur", "tirupati", "tiruvallur",
  "trivandrum", "trichy", "tumakuru", "udaipur", "ujjain", "vadodara",
  "valsad", "vapi", "varanasi", "vellore", "vijayawada", "visakhapatnam",
  "warangal", "yamunanagar", "zaheerabad",
]);

function normalisedHqLocation(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  // Already has a country / region suffix
  if (/,\s*\w/.test(trimmed)) return trimmed;
  // Indian-city lookup — append ", India"
  const lower = trimmed.toLowerCase();
  if (INDIAN_CITIES.has(lower)) return `${trimmed}, India`;
  return trimmed;
}

// ─── companyType label for prose templates ───────────────────

function companyTypeLabel(t: CompanyType): string {
  switch (t) {
    case CompanyType.OEM:
      return "EV OEM";
    case CompanyType.STARTUP:
      return "EV-industry startup";
    case CompanyType.TIER1:
      return "Tier-1 automotive supplier";
    case CompanyType.TIER2:
      return "Tier-2 automotive supplier";
    case CompanyType.BATTERY:
      return "battery / cell maker";
    case CompanyType.CHARGING:
      return "EV-charging operator";
    case CompanyType.FLEET:
      return "EV-fleet operator";
    case CompanyType.CONSULTING:
      return "EV-industry consulting / advisory";
    case CompanyType.OTHER:
    default:
      return "EV-industry company";
  }
}

// ─── About-text generator ────────────────────────────────────

interface CompanyShape {
  name: string;
  description: string | null;
  hqLocation: string | null;
  companyType: CompanyType;
  foundedYear: number | null;
}

function buildAbout(c: CompanyShape): string {
  const lines: string[] = [];

  // Sentence 1: Identity
  const label = companyTypeLabel(c.companyType);
  const place = c.hqLocation ?? null;
  const placePhrase = place ? ` headquartered in ${place}` : "";
  lines.push(`${c.name} is a ${label}${placePhrase}.`);

  // Sentence 2: Description (preserve whatever seed.ts said)
  if (c.description) {
    const desc = c.description.trim();
    lines.push(desc.endsWith(".") ? desc : `${desc}.`);
  }

  // Sentence 3: Founded
  if (c.foundedYear) {
    lines.push(`Founded in ${c.foundedYear}.`);
  }

  return lines.join(" ");
}

// ─── LinkedIn-URL heuristic ───────────────────────────────────
// Generates a guess at the LinkedIn company page URL using the slug.
// Real URLs from enrichment batches always win (we only fill if NULL).
// Pattern: https://www.linkedin.com/company/<slug>

function guessLinkedin(slug: string): string {
  // Strip the legacy "u-" prefix used for protected brand slugs
  const clean = slug.replace(/^u-/, "");
  return `https://www.linkedin.com/company/${clean}`;
}

// ─── Driver ───────────────────────────────────────────────────

async function main() {
  console.log("📦 Company basics fill");
  console.log("======================");

  const rows = await db.company.findMany({
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      about: true,
      companyType: true,
      companyTier: true,
      hqLocation: true,
      foundedYear: true,
      linkedinUrl: true,
      twitterUrl: true,
      facebookUrl: true,
      website: true,
      teamSize: true,
      logoUrl: true,
      bannerUrl: true,
    },
  });

  // ─── Pre-fill audit ─────────────────────────────────────
  const gap = {
    about: 0,
    companyTier: 0,
    hqLocation: 0,
    hqLocationNoCountry: 0,
    linkedinUrl: 0,
    twitterUrl: 0,
    facebookUrl: 0,
    website: 0,
    foundedYear: 0,
    teamSize: 0,
    logoUrl: 0,
    bannerUrl: 0,
  };
  for (const r of rows) {
    if (!r.about || r.about.trim().length === 0) gap.about++;
    if (!r.companyTier) gap.companyTier++;
    if (!r.hqLocation) gap.hqLocation++;
    if (r.hqLocation && !/,\s*\w/.test(r.hqLocation)) gap.hqLocationNoCountry++;
    if (!r.linkedinUrl) gap.linkedinUrl++;
    if (!r.twitterUrl) gap.twitterUrl++;
    if (!r.facebookUrl) gap.facebookUrl++;
    if (!r.website) gap.website++;
    if (!r.foundedYear) gap.foundedYear++;
    if (!r.teamSize) gap.teamSize++;
    if (!r.logoUrl) gap.logoUrl++;
    if (!r.bannerUrl) gap.bannerUrl++;
  }
  console.log(`   Loaded ${rows.length} companies\n`);
  console.log("   Pre-fill gap audit:");
  console.log(`     about: ............... ${gap.about} missing`);
  console.log(`     companyTier: ......... ${gap.companyTier} missing`);
  console.log(`     hqLocation (any): .... ${gap.hqLocation} missing`);
  console.log(`     hqLocation (country): ${gap.hqLocationNoCountry} without country suffix`);
  console.log(`     website: ............. ${gap.website} missing`);
  console.log(`     linkedinUrl: ......... ${gap.linkedinUrl} missing`);
  console.log(`     twitterUrl: .......... ${gap.twitterUrl} missing (admin-only fill)`);
  console.log(`     facebookUrl: ......... ${gap.facebookUrl} missing (admin-only fill)`);
  console.log(`     foundedYear: ......... ${gap.foundedYear} missing (admin-only fill)`);
  console.log(`     teamSize: ............ ${gap.teamSize} missing (admin-only fill)`);
  console.log(`     logoUrl: ............. ${gap.logoUrl} missing (admin upload only)`);
  console.log(`     bannerUrl: ........... ${gap.bannerUrl} missing (admin upload only)`);
  console.log("");

  let aboutFilled = 0;
  let aboutSkipped = 0;
  let tierFilled = 0;
  let hqNormalised = 0;
  let linkedinFilled = 0;

  for (const row of rows) {
    const updates: Record<string, unknown> = {};

    // 1. companyTier default
    if (!row.companyTier) {
      updates.companyTier = defaultTier(row.companyType);
      tierFilled++;
    }

    // 2. hqLocation country normalisation
    if (row.hqLocation) {
      const normalised = normalisedHqLocation(row.hqLocation);
      if (normalised && normalised !== row.hqLocation) {
        updates.hqLocation = normalised;
        hqNormalised++;
      }
    }

    // 3. LinkedIn URL heuristic (only if NULL)
    if (!row.linkedinUrl) {
      updates.linkedinUrl = guessLinkedin(row.slug);
      linkedinFilled++;
    }

    // 4. About-text generation
    if (!row.about || row.about.trim().length === 0) {
      updates.about = buildAbout({
        name: row.name,
        description: row.description,
        hqLocation: row.hqLocation,
        companyType: row.companyType,
        foundedYear: row.foundedYear,
      });
      aboutFilled++;
    } else {
      aboutSkipped++;
    }

    if (Object.keys(updates).length > 0) {
      await db.company.update({ where: { id: row.id }, data: updates });
    }
  }

  console.log(`\n✅ Done.`);
  console.log(`   about-text   → ${aboutFilled} filled, ${aboutSkipped} kept as-is`);
  console.log(`   companyTier  → ${tierFilled} defaulted from companyType`);
  console.log(`   hqLocation   → ${hqNormalised} normalised (added ", India" suffix)`);
  console.log(`   linkedinUrl  → ${linkedinFilled} heuristic-guessed from slug`);
}

main()
  .catch((err) => {
    console.error("✗ Company basics fill failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
