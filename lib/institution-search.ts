import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { buildTsQuery } from "@/lib/search-fts";
import { logger } from "@/lib/logger";

/**
 * Server-side institution search. Used by:
 *   • The InstitutionPicker autocomplete (via /api/institutions)
 *   • Education autosuggest on the candidate profile editor
 *   • Future: campus-drives admin filter
 *
 * Ranking strategy:
 *   1. Postgres FTS (`searchTsv` GIN index, 'simple' tokenizer +
 *      unaccent — see scripts/setup-fts.sql for the GENERATED
 *      expression). The 'simple' tokenizer doesn't stem English
 *      so "engineer" doesn't collide with "engineering" — critical
 *      for India-centric proper-noun-heavy data.
 *   2. ts_rank() drives the primary ordering — name (weight A) +
 *      shortName (A) outrank city (B) + about (C).
 *   3. Verified institutions get a small bump on top of the FTS
 *      rank so admin-curated entries float above user-submitted
 *      duplicates.
 *
 * Migrated from ILIKE + JS-side ranking on 2026-05 — see
 * lib/search-fts.ts for the shared helpers.
 */

export interface InstitutionSuggestion {
  id: string;
  name: string;
  shortName: string | null;
  city: string | null;
  state: string | null;
  type: string;
  isVerified: boolean;
  logoUrl: string | null;
}

const MIN_QUERY = 2;
const MAX_RESULTS = 10;

interface InstitutionRow {
  id: string;
  name: string;
  shortName: string | null;
  city: string | null;
  state: string | null;
  type: string;
  verificationStatus: string;
  logoUrl: string | null;
  rank: number;
}

export async function searchInstitutions(query: string): Promise<InstitutionSuggestion[]> {
  const q = query.trim();
  if (q.length < MIN_QUERY) return [];

  // ── FTS path (primary) ──────────────────────────────────────
  // Single SQL hit — FTS match on the GIN-indexed searchTsv column,
  // plus a small +0.1 bonus for VERIFIED rows so curated entries
  // outrank user-submitted ones at equal text rank. We sort by
  // (rank desc, name asc) so ties are broken alphabetically rather
  // than by undefined insertion order.
  //
  // The FTS path REQUIRES scripts/setup-fts.sql to have been run
  // against the database (it creates the `searchTsv` GENERATED
  // column + GIN index + depends on the `unaccent` extension).
  // On a fresh deploy where the setup script hasn't been run yet,
  // OR after a Prisma `db push` that confused Prisma about the
  // GENERATED column, the query below will either throw or return
  // zero rows. Either way we fall through to the ILIKE branch
  // below so the InstitutionPicker keeps working — bad ranking
  // is better than silent zero-results.
  const tsq = buildTsQuery(q);
  if (tsq) {
    try {
      const rows = await db.$queryRaw<InstitutionRow[]>`
        SELECT
          id,
          name,
          "shortName",
          city,
          state,
          type::text,
          "verificationStatus"::text,
          "logoUrl",
          ts_rank("searchTsv", to_tsquery('simple', ${tsq}))
            + CASE WHEN "verificationStatus" = 'VERIFIED' THEN 0.1 ELSE 0 END
            AS rank
        FROM "Institution"
        WHERE "searchTsv" @@ to_tsquery('simple', ${tsq})
        ORDER BY rank DESC, name ASC
        LIMIT ${Prisma.raw(String(MAX_RESULTS))}
      `;
      if (rows.length > 0) return rows.map(toSuggestion);
      // Zero rows is suspicious — either the query genuinely has
      // no matches OR the searchTsv column is empty / missing
      // (setup-fts.sql not run). Fall through to ILIKE to verify.
    } catch (err) {
      // Most likely cause: the `searchTsv` column doesn't exist
      // on this DB (setup-fts.sql never ran), or the `unaccent`
      // extension is missing. Either way, the FTS query throws
      // and we silently fall back. Worth a warn-log so the team
      // notices the degraded state in production.
      logger.warn(
        { err, query: q },
        "[institution-search] FTS path failed, falling back to ILIKE — run scripts/setup-fts.sql on the DB to restore FTS ranking",
      );
    }
  }

  // ── ILIKE fallback ──────────────────────────────────────────
  // Substring match on name + shortName. Slower at scale (no GIN
  // index, so it's a Seq Scan), but the Institution table is
  // bounded (~thousands of rows in prod, not millions) and the
  // picker only ever requests 10 results. Performance is fine
  // for the InstitutionPicker use case even without FTS.
  //
  // Two-pronged match: starts-with on name (best signal — typing
  // "IIT" should rank IIT-Bombay above "Calcutta Institute of IT")
  // OR substring-contains. We surface starts-with hits first by
  // ordering on a CASE expression. Verified entries still outrank
  // unverified at equal ordinal.
  const fallbackRows = await db.institution.findMany({
    where: {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { shortName: { contains: q, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      shortName: true,
      city: true,
      state: true,
      type: true,
      verificationStatus: true,
      logoUrl: true,
    },
    take: MAX_RESULTS * 2, // overfetch so JS-side ranking has options
  });

  // JS-side ranking: starts-with on name (3) > starts-with on
  // shortName (2) > contains-in-name (1) > contains-in-shortName (0).
  // Verified bumps everyone by +0.5 across all tiers.
  const lowerQ = q.toLowerCase();
  const ranked = fallbackRows
    .map((r) => {
      let score = 0;
      const lowerName = r.name.toLowerCase();
      const lowerShort = r.shortName?.toLowerCase() ?? "";
      if (lowerName.startsWith(lowerQ)) score = 3;
      else if (lowerShort.startsWith(lowerQ)) score = 2;
      else if (lowerName.includes(lowerQ)) score = 1;
      else if (lowerShort.includes(lowerQ)) score = 0;
      if (r.verificationStatus === "VERIFIED") score += 0.5;
      return { row: r, score };
    })
    .sort((a, b) => b.score - a.score || a.row.name.localeCompare(b.row.name))
    .slice(0, MAX_RESULTS);

  return ranked.map((entry) => ({
    id: entry.row.id,
    name: entry.row.name,
    shortName: entry.row.shortName,
    city: entry.row.city,
    state: entry.row.state,
    type: String(entry.row.type),
    isVerified: entry.row.verificationStatus === "VERIFIED",
    logoUrl: entry.row.logoUrl,
  }));
}

function toSuggestion(row: InstitutionRow): InstitutionSuggestion {
  return {
    id: row.id,
    name: row.name,
    shortName: row.shortName,
    city: row.city,
    state: row.state,
    type: row.type,
    isVerified: row.verificationStatus === "VERIFIED",
    logoUrl: row.logoUrl,
  };
}
