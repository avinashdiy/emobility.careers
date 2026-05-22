import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import {
  CountryLandingPage,
  generateCountryMetadata,
} from "@/components/country/CountryLandingPage";

// Per-country landing — Malaysia. DIYguru has a center here so
// graduates land directly into the platform — content emphasises
// that pipeline.

export const metadata: Metadata = generateCountryMetadata("MY");

export default function MalaysiaLandingRoute() {
  return (
    <>
      <SiteHeader />
      <CountryLandingPage country="MY" />
      <SiteFooter />
    </>
  );
}
