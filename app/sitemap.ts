import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

  const staticPaths: MetadataRoute.Sitemap = [
    "",
    "/jobs",
    "/companies",
    "/mentors",
    "/feed",
    "/people",
    "/competitions",
    "/pulse",
    "/salaries",
    "/about",
    "/signup",
    "/signin",
  ].map((p) => ({
    url: `${base}${p}`,
    lastModified: new Date(),
    changeFrequency: p === "/jobs" || p === "/feed" ? "hourly" : "daily",
    priority: p === "" ? 1 : 0.8,
  }));

  // Pull all the dynamic surfaces in parallel — reading from a hot
  // sitemap shouldn't fan out a serial waterfall of DB hits.
  const [jobs, companies, candidates, posts, tagRows] = await Promise.all([
    db.jobPosting
      .findMany({
        where: { status: "OPEN" },
        select: { id: true, updatedAt: true },
        orderBy: { publishedAt: "desc" },
        take: 1000,
      })
      .catch(() => []),
    db.company
      .findMany({
        where: { verificationStatus: "VERIFIED" },
        select: { slug: true, updatedAt: true },
        take: 500,
      })
      .catch(() => []),
    db.candidateProfile
      .findMany({
        where: { cvVisibility: "EVERYONE" },
        select: { slug: true, updatedAt: true },
        take: 5000,
      })
      .catch(() => []),
    // Public posts: QUESTIONs are highest-value for SERP because they
    // map cleanly to Google's "discussions and forums" rich result.
    // ARTICLE and TEXT posts also indexed — they carry author + body
    // content that contributes to topical authority for the site.
    // We cap at 5000 to keep the sitemap under Google's 50k / 50MB
    // limits with plenty of headroom; the sitemap-index can shard if
    // we ever exceed that.
    db.post
      .findMany({
        where: {
          visibility: "PUBLIC",
          kind: { in: ["QUESTION", "ARTICLE", "TEXT"] },
        },
        select: { id: true, kind: true, updatedAt: true, createdAt: true },
        orderBy: { updatedAt: "desc" },
        take: 5000,
      })
      .catch(() => []),
    // Hashtag community pages — the tag with even one public post is
    // worth indexing. Same query the trending list uses on the admin
    // dashboard, but unbounded by time so older communities still
    // surface. Distinct tags via SQL since `hashtags` is text[].
    db.$queryRaw<{ tag: string; last_used: Date }[]>`
      SELECT lower(t) AS tag, MAX("createdAt") AS last_used
      FROM "Post", unnest("hashtags") AS t
      WHERE visibility = 'PUBLIC'
      GROUP BY lower(t)
      HAVING COUNT(*) >= 1
      ORDER BY last_used DESC
      LIMIT 5000
    `.catch(() => [] as { tag: string; last_used: Date }[]),
  ]);

  return [
    ...staticPaths,
    ...jobs.map((j) => ({
      url: `${base}/jobs/${j.id}`,
      lastModified: j.updatedAt,
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
    ...companies.map((c) => ({
      url: `${base}/company/${c.slug}`,
      lastModified: c.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...candidates.map((c) => ({
      url: `${base}/${c.slug}`,
      lastModified: c.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
    ...posts.map((p) => ({
      url: `${base}/posts/${p.id}`,
      lastModified: p.updatedAt,
      // QUESTIONs accumulate answers + comments over time → daily;
      // ARTICLE/TEXT posts settle quickly → weekly.
      changeFrequency:
        p.kind === "QUESTION" ? ("daily" as const) : ("weekly" as const),
      // Boost questions slightly — they're the highest-value SERP target
      // because Q&A surfaces in AI Overviews / Reddit-style results.
      priority: p.kind === "QUESTION" ? 0.7 : 0.5,
    })),
    ...tagRows.map((t) => ({
      url: `${base}/tag/${encodeURIComponent(t.tag)}`,
      lastModified: t.last_used,
      changeFrequency: "weekly" as const,
      priority: 0.4,
    })),
  ];
}
