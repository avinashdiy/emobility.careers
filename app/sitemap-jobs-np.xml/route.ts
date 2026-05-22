import { renderCountryJobsSitemap } from "@/lib/seo/country-jobs-sitemap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-country jobs sitemap — Nepal. Submit to `/np/` in GSC.
export const GET = () => renderCountryJobsSitemap("NP");
