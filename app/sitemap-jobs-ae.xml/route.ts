import { renderCountryJobsSitemap } from "@/lib/seo/country-jobs-sitemap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-country jobs sitemap — UAE. Submit to the `/ae/` GSC
// property for country-attributed crawl stats. See
// lib/seo/country-jobs-sitemap.ts for the rationale.
export const GET = () => renderCountryJobsSitemap("AE");
