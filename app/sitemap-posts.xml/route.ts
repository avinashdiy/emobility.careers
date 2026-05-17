import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { renderUrlSet, xmlHeaders } from "@/lib/seo/sitemap-xml";

/**
 * Public posts sitemap — QUESTION / ARTICLE / TEXT posts only (POLL,
 * IMAGE, VIDEO etc. don't carry indexable text). Capped at 50k.
 *
 * QUESTIONs get a higher priority (0.7) because they map to Google's
 * "discussions and forums" rich result. ARTICLE / TEXT (0.5) settle
 * quickly and don't accumulate answers.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

  const posts = await db.post.findMany({
    where: {
      visibility: "PUBLIC",
      kind: { in: ["QUESTION", "ARTICLE", "TEXT"] },
    },
    orderBy: { updatedAt: "desc" },
    take: 50_000,
    select: { id: true, kind: true, updatedAt: true },
  });

  const xml = renderUrlSet(
    posts.map((p) => ({
      loc: `${base}/posts/${p.id}`,
      lastmod: p.updatedAt,
      changefreq: p.kind === "QUESTION" ? "daily" : "weekly",
      priority: p.kind === "QUESTION" ? 0.7 : 0.5,
    })),
  );

  return new Response(xml, { status: 200, headers: xmlHeaders(1800) });
}
