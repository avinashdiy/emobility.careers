import { renderCountryCompaniesSitemap } from "@/lib/seo/country-companies-sitemap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-country companies sitemap — Malaysia. Submit to `/my/` in GSC.
export const GET = () => renderCountryCompaniesSitemap("MY");
