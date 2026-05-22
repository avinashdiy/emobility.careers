import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import {
  CountryLandingPage,
  generateCountryMetadata,
} from "@/components/country/CountryLandingPage";

// Per-country landing — Nepal. 90%+ hydropower base makes EV
// electrification high-priority; Hetauda EV bus + Kathmandu
// charging build-out drive employer demand. DIYguru center is
// the talent supply.

export const metadata: Metadata = generateCountryMetadata("NP");

export default function NepalLandingRoute() {
  return (
    <>
      <SiteHeader />
      <CountryLandingPage country="NP" />
      <SiteFooter />
    </>
  );
}
