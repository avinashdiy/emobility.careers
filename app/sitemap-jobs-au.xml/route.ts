import { renderCountryJobsSitemap } from "@/lib/seo/country-jobs-sitemap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-country jobs sitemap — Australia. Submit to `/au/` in GSC.
export const GET = () => renderCountryJobsSitemap("AU");
