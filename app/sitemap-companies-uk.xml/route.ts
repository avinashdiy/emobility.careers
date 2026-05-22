import { renderCountryCompaniesSitemap } from "@/lib/seo/country-companies-sitemap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-country companies sitemap — United Kingdom (Prisma `GB`).
// Submit to `/uk/` in GSC.
export const GET = () => renderCountryCompaniesSitemap("GB");
