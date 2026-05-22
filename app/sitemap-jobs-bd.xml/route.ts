import { renderCountryJobsSitemap } from "@/lib/seo/country-jobs-sitemap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-country jobs sitemap — Bangladesh. Submit to `/bd/` in GSC.
export const GET = () => renderCountryJobsSitemap("BD");
