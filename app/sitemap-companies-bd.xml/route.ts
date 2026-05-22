import { renderCountryCompaniesSitemap } from "@/lib/seo/country-companies-sitemap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-country companies sitemap — Bangladesh. Submit to `/bd/` in GSC.
export const GET = () => renderCountryCompaniesSitemap("BD");
