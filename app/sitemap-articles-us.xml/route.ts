import { renderCountryArticlesSitemap } from "@/lib/seo/country-articles-sitemap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-country articles sitemap — United States. Submit to `/us/` in GSC.
export const GET = () => renderCountryArticlesSitemap("US");
