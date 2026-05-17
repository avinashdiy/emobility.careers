import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { renderUrlSet, xmlHeaders } from "@/lib/seo/sitemap-xml";

/**
 * Institutions sitemap — universities, colleges, polytechnics, ITIs,
 * research labs, training centres. ~180 seeded + long-tail
 * user-submitted entries; single shard handles everything for years.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

  const institutions = await db.institution.findMany({
    where: { verificationStatus: "VERIFIED" },
    orderBy: { updatedAt: "desc" },
    take: 50_000,
    select: { slug: true, updatedAt: true },
  });

  const xml = renderUrlSet(
    institutions.map((i) => ({
      loc: `${base}/institutions/${i.slug}`,
      lastmod: i.updatedAt,
      changefreq: "weekly",
      priority: 0.5,
    })),
  );

  return new Response(xml, { status: 200, headers: xmlHeaders(3600) });
}
