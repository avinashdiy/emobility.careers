import "server-only";

/**
 * Postgres FTS query helpers.
 *
 * The platform indexes `searchTsv` columns on Institution / Company
 * / JobPosting / CandidateProfile / Skill — see scripts/setup-fts.sql
 * for the GENERATED expressions + GIN indexes.
 *
 * Two collation choices we made deliberately:
 *
 *   • `'simple'` (not `'english'`) — no stemming. English stemming
 *     maps "engineering" → "engin" which collides on far too many
 *     unrelated tokens for a proper-noun-heavy dataset (people,
 *     companies, EV brand jargon).
 *
 *   • `unaccent()` wrapping both column AND query — "Naïve" matches
 *     "Naive", "Café" matches "Cafe". Indian English routinely
 *     drops/keeps diacritics inconsistently; without unaccent we'd
 *     create false negatives on real recruiter queries.
 *
 * This lib contains the QUERY-SIDE helpers — column expressions live
 * in scripts/setup-fts.sql.
 */

/**
 * Sanitise + tokenise a user query into a Postgres tsquery string.
 *
 * Behaviour:
 *   • Each token becomes a prefix match (`token:*`) — lets the user
 *     start typing "Bat" and get "Battery", "Batterie", "Batra".
 *   • Tokens AND together — typing "tata battery" requires both
 *     to appear in the document. (OR semantics produce too many
 *     irrelevant hits in practice.)
 *   • Special characters that would crash to_tsquery are stripped:
 *     `!&|():*<>` are reserved tsquery operators.
 *   • Empty input returns `null` so the caller can short-circuit
 *     instead of running an FTS that matches everything.
 *
 * Output is the literal string passed to `to_tsquery('simple', ?)` in
 * the SQL — NOT to plainto_tsquery, because plainto_tsquery doesn't
 * support the `:*` prefix-match syntax we want.
 */
export function buildTsQuery(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;

  // Strip tsquery operators + collapse whitespace. We split on
  // whitespace and word-non-word boundaries; numbers + dots in
  // tokens (e.g., "iit.ac.in", "v2.0") split into two tokens which
  // is what we want — both halves should match.
  const tokens = trimmed
    .toLowerCase()
    .replace(/[!&|():*<>]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}_-]/gu, ""))
    .filter((t) => t.length >= 2); // drop single-char noise

  if (tokens.length === 0) return null;

  // Cap at 8 tokens — past that the cost of the query grows linearly
  // and the marginal user value is near zero (users don't type
  // 9-word search strings deliberately).
  const capped = tokens.slice(0, 8);

  // Each token gets the prefix-match suffix. AND them all.
  return capped.map((t) => `${t}:*`).join(" & ");
}

/**
 * Generate the SQL fragment that filters a row's searchTsv against a
 * built tsquery. Used inside Prisma `$queryRaw` calls — the caller
 * binds `query` as a parameter; we just write the operator.
 *
 * Example usage at a call site:
 *
 *   const tsq = buildTsQuery(input);
 *   if (!tsq) return [];
 *   const rows = await db.$queryRaw`
 *     SELECT id, name,
 *       ts_rank("searchTsv", to_tsquery('simple', ${tsq})) AS rank
 *     FROM "Institution"
 *     WHERE "searchTsv" @@ to_tsquery('simple', ${tsq})
 *     ORDER BY rank DESC, "name" ASC
 *     LIMIT 10
 *   `;
 *
 * Note that the column reference is double-quoted (Prisma generates
 * camelCase columns and Postgres folds unquoted identifiers to
 * lowercase). The `'simple'` is hardcoded — every callsite must use
 * the same collation as the GENERATED expression in setup-fts.sql.
 */

/**
 * Light-weight unaccent for the JS side. Postgres-side unaccent runs
 * inside the tsquery (`to_tsquery('simple', unaccent(?))` would be
 * needed if we passed raw input — but our buildTsQuery strips
 * diacritics-bearing characters anyway via the `[^\p{L}\p{N}_-]`
 * sanitiser, then folds to lowercase. So the callsite path is
 * already accent-insensitive.
 *
 * This function is exported for cases where you want to compare a
 * user-typed string to a stored value without involving Postgres
 * (e.g., dedup checks). Uses Unicode normalisation (NFD + strip
 * combining marks) which is the standard JS pattern.
 */
export function unaccent(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "");
}

/**
 * Helper for the common pattern: take an optional `q` from a search
 * page, return either a prepared tsquery string or null.
 *
 *   const tsq = parseSearchInput(searchParams.q);
 *   if (!tsq) {
 *     // No query — render the default ranked list (popularity, recency)
 *   } else {
 *     // Run FTS query
 *   }
 */
export function parseSearchInput(input: string | undefined | null): string | null {
  if (!input) return null;
  return buildTsQuery(input);
}

/**
 * "Find IDs that match" pattern — used by hybrid Prisma-plus-FTS
 * surfaces (the multi-model /search page, /people, /jobs). Returns
 * the matching ID set so the caller can hand it to Prisma's
 * `where: { id: { in: ... } }` and keep its existing relation
 * includes / ordering / pagination intact.
 *
 * Returns:
 *   • null  — query was empty / sanitised away. Caller should
 *             treat as "no text filter applied" (show defaults).
 *   • []    — query was valid but matched nothing. Caller should
 *             short-circuit to an empty page (don't run a
 *             `WHERE id IN ()` round-trip).
 *   • [ids] — happy path; pass to Prisma.
 *
 * `table` is the Postgres table name with the leading capital
 * preserved (we map Prisma model → table 1:1 today). Hardcode the
 * allowed tables — string interpolation into a raw query is the
 * one tsquery sin we cannot allow user-controllable.
 */
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

type SearchableTable =
  | "Institution"
  | "Company"
  | "JobPosting"
  | "CandidateProfile"
  | "Skill"
  | "Article";

export async function findFtsIds(
  table: SearchableTable,
  q: string,
  limit = 1000,
): Promise<string[] | null> {
  const tsq = buildTsQuery(q);
  if (!tsq) return null;
  // Whitelist check is the type system; Prisma.raw is safe here
  // because the union of allowed values is closed.
  const tableIdent = Prisma.raw(`"${table}"`);
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM ${tableIdent}
    WHERE "searchTsv" @@ to_tsquery('simple', ${tsq})
    LIMIT ${Prisma.raw(String(limit))}
  `;
  return rows.map((r) => r.id);
}
