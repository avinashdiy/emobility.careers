import { renderCountryJobsSitemap } from "@/lib/seo/country-jobs-sitemap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-country jobs sitemap — United Kingdom (Prisma enum `GB`).
// Submit to the `/uk/` GSC property.
export const GET = () => renderCountryJobsSitemap("GB");
