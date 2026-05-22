import { renderCountryCompaniesSitemap } from "@/lib/seo/country-companies-sitemap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-country companies sitemap — India. The default-market
// shard. The global `sitemap-companies.xml` stays in place for
// back-compat with existing GSC submissions; this is the
// country-attributed version for the root `emobility.careers/`
// property in GSC.
export const GET = () => renderCountryCompaniesSitemap("IN");
