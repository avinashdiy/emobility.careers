import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  return {
    rules: [
      // Google's job-posting crawler is "Googlebot" itself — no special
      // user-agent. Same disallow set applies for non-public surfaces.
      {
        userAgent: "*",
        allow: ["/", "/jobs", "/jobs/", "/companies", "/company/"],
        disallow: ["/api/", "/admin/", "/employer/", "/me/", "/onboarding/", "/403"],
      },
    ],
    // Multiple sitemap entries are valid; search engines fetch them all.
    sitemap: [
      `${base}/sitemap_index.xml`,
      `${base}/sitemap.xml`,
      `${base}/sitemap-jobs.xml`,
    ],
    host: base,
  };
}
