import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import {
  CountryLandingPage,
  generateCountryMetadata,
} from "@/components/country/CountryLandingPage";

// Per-country landing — UAE. Mirrors the wrapper pattern of every
// other country page; the heavy lifting lives in the shared
// `CountryLandingPage` component so a copy / styling change in one
// place updates all seven markets at once.

export const metadata: Metadata = generateCountryMetadata("AE");

export default function UaeLandingRoute() {
  return (
    <>
      <SiteHeader />
      <CountryLandingPage country="AE" />
      <SiteFooter />
    </>
  );
}
