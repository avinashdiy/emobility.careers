import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import {
  CountryLandingPage,
  generateCountryMetadata,
} from "@/components/country/CountryLandingPage";

// Per-country landing — Bangladesh. Early-stage EV market with
// strong three-wheeler and two-wheeler segments; DIYguru center
// produces specialised graduates.

export const metadata: Metadata = generateCountryMetadata("BD");

export default function BangladeshLandingRoute() {
  return (
    <>
      <SiteHeader />
      <CountryLandingPage country="BD" />
      <SiteFooter />
    </>
  );
}
