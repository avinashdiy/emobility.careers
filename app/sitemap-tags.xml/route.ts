import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { renderUrlSet, xmlHeaders } from "@/lib/seo/sitemap-xml";

/**
 * Hashtag community pages — any tag with one or more PUBLIC posts.
 * `Post.hashtags` is `text[]`, so we use `unnest` to distinct-count
 * the tags. Capped at 50k for the protocol.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

  const tagRows = await db.$queryRaw<{ tag: string; last_used: Date }[]>`
    SELECT lower(t) AS tag, MAX("createdAt") AS last_used
    FROM "Post", unnest("hashtags") AS t
    WHERE visibility = 'PUBLIC'
    GROUP BY lower(t)
    HAVING COUNT(*) >= 1
    ORDER BY last_used DESC
    LIMIT 50000
  `.catch(() => [] as { tag: string; last_used: Date }[]);

  const xml = renderUrlSet(
    tagRows.map((t) => ({
      loc: `${base}/tag/${encodeURIComponent(t.tag)}`,
      lastmod: t.last_used,
      changefreq: "weekly",
      priority: 0.4,
    })),
  );

  return new Response(xml, { status: 200, headers: xmlHeaders(1800) });
}
