import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { buildTsQuery } from "@/lib/search-fts";

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

  const tsq = buildTsQuery(q);
  if (!tsq) return [];

  // Single SQL hit — FTS match on the GIN-indexed searchTsv column,
  // plus a small +0.1 bonus for VERIFIED rows so curated entries
  // outrank user-submitted ones at equal text rank. We sort by
  // (rank desc, name asc) so ties are broken alphabetically rather
  // than by undefined insertion order.
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

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    shortName: row.shortName,
    city: row.city,
    state: row.state,
    type: row.type,
    isVerified: row.verificationStatus === "VERIFIED",
    logoUrl: row.logoUrl,
  }));
}
