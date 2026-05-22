import { renderCountryJobsSitemap } from "@/lib/seo/country-jobs-sitemap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-country jobs sitemap — India. Mirrors the root
// `sitemap-jobs.xml` but country-filtered for explicit
// attribution to the (default-targeted) root GSC property.
// The unfiltered `sitemap-jobs.xml` stays in place for
// back-compat with anything already submitted; we don't
// strictly need this India shard yet, but it completes the
// per-country set so all eight markets follow the same
// `sitemap-jobs-{cc}.xml` naming.
export const GET = () => renderCountryJobsSitemap("IN");
