import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import {
  CountryJobsListing,
  generateCountryJobsMetadata,
} from "@/components/jobs/CountryJobsListing";

// /us/jobs — United States-filtered jobs listing.

export const metadata: Metadata = generateCountryJobsMetadata("US");

export default function UsJobsRoute() {
  return (
    <>
      <SiteHeader />
      <CountryJobsListing country="US" />
      <SiteFooter />
    </>
  );
}
