import { env } from "@/lib/env";
import { renderUrlSet, xmlHeaders } from "@/lib/seo/sitemap-xml";

/**
 * Static marketing + landing pages — the hand-curated entry points
 * (home, /jobs, /companies, /institutions, /fairs, etc.). Splits out
 * the dynamic surfaces (jobs, companies, etc.) which live in their
 * own shards.
 */

export const runtime = "nodejs";
export const revalidate = 86400; // 24h — these URLs don't change.

export async function GET() {
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const now = new Date();

  const paths: { path: string; priority?: number; changefreq?: "hourly" | "daily" | "weekly" }[] = [
    { path: "", priority: 1, changefreq: "daily" },
    { path: "/jobs", priority: 0.9, changefreq: "hourly" },
    { path: "/companies", priority: 0.9, changefreq: "daily" },
    // A–Z directory + every letter page. The 27 per-letter URLs
    // each carry their own canonical (see generateMetadata in
    // companies/a-z/page.tsx) so search engines treat them as
    // distinct content rather than dup variants.
    { path: "/companies/a-z", priority: 0.7, changefreq: "weekly" },
    ...["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z","%23"].map(
      (l) => ({
        path: `/companies/a-z?letter=${l}`,
        priority: 0.5 as number,
        changefreq: "weekly" as const,
      }),
    ),
    { path: "/institutions", priority: 0.8, changefreq: "daily" },
    { path: "/colleges/register", priority: 0.8, changefreq: "weekly" },
    { path: "/fairs", priority: 0.8, changefreq: "daily" },
    { path: "/mentors", priority: 0.7, changefreq: "daily" },
    { path: "/feed", priority: 0.7, changefreq: "hourly" },
    { path: "/people", priority: 0.7, changefreq: "daily" },
    { path: "/competitions", priority: 0.7, changefreq: "weekly" },
    { path: "/pulse", priority: 0.7, changefreq: "hourly" },
    { path: "/salaries", priority: 0.7, changefreq: "weekly" },
    { path: "/about", priority: 0.5, changefreq: "weekly" },
    { path: "/signup", priority: 0.5, changefreq: "weekly" },
    { path: "/signin", priority: 0.5, changefreq: "weekly" },
  ];

  const xml = renderUrlSet(
    paths.map((p) => ({
      loc: `${base}${p.path}`,
      lastmod: now,
      changefreq: p.changefreq,
      priority: p.priority,
    })),
  );

  return new Response(xml, { status: 200, headers: xmlHeaders(86400) });
}
