import "server-only";
import { db } from "@/lib/db";
import { SlugRedirectEntityType } from "@prisma/client";

/**
 * Slug-redirect lookup helper.
 *
 * Each public detail-page route (company, institution, article,
 * candidate) calls `getSlugRedirect()` *before* its own DB lookup.
 * If a row exists, the caller fires a `permanentRedirect(308)` to
 * the canonical URL. If not, the route does its normal entity
 * lookup. The query is cheap (composite unique index on
 * (entityType, fromSlug)) so the always-on cost is sub-millisecond.
 *
 * Returns the target slug (NOT the full URL — the caller constructs
 * the URL because the URL prefix differs per entity:
 *   COMPANY     → /company/<slug>
 *   INSTITUTION → /institutions/<slug>
 *   ARTICLE     → /<slug>             (root permalink)
 *   CANDIDATE   → /<slug>             (root permalink)
 * ).
 */
export async function getSlugRedirect(
  entityType: SlugRedirectEntityType,
  fromSlug: string,
): Promise<string | null> {
  if (!fromSlug) return null;
  const row = await db.slugRedirect
    .findUnique({
      where: { entityType_fromSlug: { entityType, fromSlug } },
      select: { toSlug: true },
    })
    .catch(() => null);
  return row?.toSlug ?? null;
}

/**
 * Build the canonical destination URL for a redirect target. Used
 * by the per-route handlers so the URL convention lives in one
 * place — change it here, every route follows.
 */
export function urlForEntity(
  entityType: SlugRedirectEntityType,
  slug: string,
): string {
  switch (entityType) {
    case "COMPANY":
      return `/company/${slug}`;
    case "INSTITUTION":
      return `/institutions/${slug}`;
    case "ARTICLE":
    case "CANDIDATE":
      // Both serve at the root permalink — the [username] catch-all
      // dispatches based on which table matches.
      return `/${slug}`;
  }
}
