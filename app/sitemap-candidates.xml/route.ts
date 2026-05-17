import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { renderUrlSet, xmlHeaders } from "@/lib/seo/sitemap-xml";

/**
 * Candidate-profile sitemap. Only EVERYONE-visible profiles surface
 * (RECRUITERS_ONLY and PRIVATE candidates are deliberately excluded).
 *
 * Capped at 50k per shard. Prod has ~50k candidates, so we're at
 * the protocol ceiling — when we cross 50k VISIBLE candidates this
 * needs to split into:
 *   • sitemap-candidates-1.xml (most recently updated, first 50k)
 *   • sitemap-candidates-2.xml (next 50k by updatedAt desc, oldest first)
 *   • bump the sitemap index to list both.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

  const candidates = await db.candidateProfile.findMany({
    where: { cvVisibility: "EVERYONE" },
    orderBy: { updatedAt: "desc" },
    take: 50_000,
    select: { slug: true, updatedAt: true },
  });

  const xml = renderUrlSet(
    candidates.map((c) => ({
      loc: `${base}/${c.slug}`,
      lastmod: c.updatedAt,
      changefreq: "weekly",
      priority: 0.5,
    })),
  );

  return new Response(xml, { status: 200, headers: xmlHeaders(3600) });
}
