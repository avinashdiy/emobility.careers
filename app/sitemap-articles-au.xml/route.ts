import { renderCountryArticlesSitemap } from "@/lib/seo/country-articles-sitemap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-country articles sitemap — Australia. Submit to `/au/` in GSC.
export const GET = () => renderCountryArticlesSitemap("AU");
