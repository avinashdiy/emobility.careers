import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import {
  CountryLandingPage,
  generateCountryMetadata,
} from "@/components/country/CountryLandingPage";

// Per-country landing — Australia.

export const metadata: Metadata = generateCountryMetadata("AU");

export default function AustraliaLandingRoute() {
  return (
    <>
      <SiteHeader />
      <CountryLandingPage country="AU" />
      <SiteFooter />
    </>
  );
}
