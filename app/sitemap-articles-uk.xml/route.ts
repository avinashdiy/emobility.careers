import { renderCountryArticlesSitemap } from "@/lib/seo/country-articles-sitemap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-country articles sitemap — United Kingdom (Prisma `GB`).
// Submit to `/uk/` in GSC.
export const GET = () => renderCountryArticlesSitemap("GB");
