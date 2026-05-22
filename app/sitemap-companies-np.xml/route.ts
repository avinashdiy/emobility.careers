import { renderCountryCompaniesSitemap } from "@/lib/seo/country-companies-sitemap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-country companies sitemap — Nepal. Submit to `/np/` in GSC.
export const GET = () => renderCountryCompaniesSitemap("NP");
