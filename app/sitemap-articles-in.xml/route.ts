import { renderCountryArticlesSitemap } from "@/lib/seo/country-articles-sitemap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-country articles sitemap — India. Submit to root `/`
// (default-market) GSC property. The legacy `/sitemap-articles.xml`
// stays in place for back-compat with anything already submitted;
// this is the country-attributed lens.
export const GET = () => renderCountryArticlesSitemap("IN");
