import { renderCountryCompaniesSitemap } from "@/lib/seo/country-companies-sitemap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-country companies sitemap — United States. Submit to `/us/` in GSC.
export const GET = () => renderCountryCompaniesSitemap("US");
