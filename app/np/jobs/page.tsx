import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import {
  CountryJobsListing,
  generateCountryJobsMetadata,
} from "@/components/jobs/CountryJobsListing";

// /np/jobs — Nepal-filtered jobs listing.

export const metadata: Metadata = generateCountryJobsMetadata("NP");

export default function NepalJobsRoute() {
  return (
    <>
      <SiteHeader />
      <CountryJobsListing country="NP" />
      <SiteFooter />
    </>
  );
}
