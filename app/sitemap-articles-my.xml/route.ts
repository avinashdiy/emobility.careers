import { renderCountryArticlesSitemap } from "@/lib/seo/country-articles-sitemap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-country articles sitemap — Malaysia. Submit to `/my/` in GSC.
export const GET = () => renderCountryArticlesSitemap("MY");
