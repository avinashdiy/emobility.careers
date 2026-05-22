import { renderCountryArticlesSitemap } from "@/lib/seo/country-articles-sitemap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-country articles sitemap — UAE. Submit to `/ae/` in GSC.
export const GET = () => renderCountryArticlesSitemap("AE");
