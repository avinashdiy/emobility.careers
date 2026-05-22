import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import {
  CountryLandingPage,
  generateCountryMetadata,
} from "@/components/country/CountryLandingPage";

// Per-country landing — United States.

export const metadata: Metadata = generateCountryMetadata("US");

export default function UsLandingRoute() {
  return (
    <>
      <SiteHeader />
      <CountryLandingPage country="US" />
      <SiteFooter />
    </>
  );
}
