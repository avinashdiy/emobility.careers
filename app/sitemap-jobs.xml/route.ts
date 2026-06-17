import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { renderUrlSet, xmlHeaders } from "@/lib/seo/sitemap-xml";

/**
 * Dedicated jobs sitemap. Google's Jobs crawler ingests sitemaps
 * separately from regular search and prefers a smaller, jobs-only
 * sitemap with `lastmod` timestamps so it can re-crawl quickly when
 * listings change.
 *
 * Cap of 50,000 URLs per sitemap (per protocol). When the platform
 * exceeds that, paginate behind the sitemap index (e.g. add
 * `sitemap-jobs-2.xml` and bump the index).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

  const jobs = await db.jobPosting.findMany({
    // audience PUBLIC only — DIYGURU_ONLY / INVITE_ONLY jobs redirect
    // anonymous crawlers to /signin (see app/(marketing)/job/[slug]),
    // so listing them here just feeds Google "Page with redirect".
    where: { status: "OPEN", audience: "PUBLIC", company: { verificationStatus: "VERIFIED" } },
    orderBy: { publishedAt: "desc" },
    take: 50_000,
    select: { slug: true, updatedAt: true, publishedAt: true },
  });

  // Canonical URL is the slug-based route. The legacy `/jobs/{id}`
  // path 308-redirects here, but pointing search engines straight at
  // the canonical avoids a redirect chain on every crawl.
  const xml = renderUrlSet(
    jobs.map((j) => ({
      loc: `${base}/job/${j.slug}`,
      lastmod: j.updatedAt ?? j.publishedAt ?? new Date(),
      changefreq: "daily",
      priority: 0.8,
    })),
  );

  return new Response(xml, { status: 200, headers: xmlHeaders(600) });
}
