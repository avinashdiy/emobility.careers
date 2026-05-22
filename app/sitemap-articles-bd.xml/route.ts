import { renderCountryArticlesSitemap } from "@/lib/seo/country-articles-sitemap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-country articles sitemap — Bangladesh. Submit to `/bd/` in GSC.
export const GET = () => renderCountryArticlesSitemap("BD");
