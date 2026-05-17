import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { renderUrlSet, xmlHeaders } from "@/lib/seo/sitemap-xml";

/**
 * Companies sitemap — every VERIFIED company gets a `/company/<slug>`
 * entry. Capped at 50k (protocol limit); the project has ~528 verified
 * companies in prod, so a single shard fits comfortably.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

  const companies = await db.company.findMany({
    where: { verificationStatus: "VERIFIED" },
    orderBy: { updatedAt: "desc" },
    take: 50_000,
    select: { slug: true, updatedAt: true },
  });

  const xml = renderUrlSet(
    companies.map((c) => ({
      loc: `${base}/company/${c.slug}`,
      lastmod: c.updatedAt,
      changefreq: "weekly",
      priority: 0.6,
    })),
  );

  return new Response(xml, { status: 200, headers: xmlHeaders(3600) });
}
