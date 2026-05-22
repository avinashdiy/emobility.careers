import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import {
  CountryLandingPage,
  generateCountryMetadata,
} from "@/components/country/CountryLandingPage";

// Per-country landing — United Kingdom. Note the URL is /uk (not
// /gb) for SEO clarity; Prisma uses the ISO `GB` enum value
// internally. The `SUPPORTED_COUNTRIES.GB.subfolder` is "uk" so
// the routing layer maps the URL → enum cleanly.

export const metadata: Metadata = generateCountryMetadata("GB");

export default function UkLandingRoute() {
  return (
    <>
      <SiteHeader />
      <CountryLandingPage country="GB" />
      <SiteFooter />
    </>
  );
}
