import { renderCountryArticlesSitemap } from "@/lib/seo/country-articles-sitemap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-country articles sitemap — Nepal. Submit to `/np/` in GSC.
export const GET = () => renderCountryArticlesSitemap("NP");
