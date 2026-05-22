import { renderCountryJobsSitemap } from "@/lib/seo/country-jobs-sitemap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-country jobs sitemap — United States. Submit to `/us/` in GSC.
export const GET = () => renderCountryJobsSitemap("US");
