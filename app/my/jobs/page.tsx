import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import {
  CountryJobsListing,
  generateCountryJobsMetadata,
} from "@/components/jobs/CountryJobsListing";

// /my/jobs — Malaysia-filtered jobs listing.

export const metadata: Metadata = generateCountryJobsMetadata("MY");

export default function MalaysiaJobsRoute() {
  return (
    <>
      <SiteHeader />
      <CountryJobsListing country="MY" />
      <SiteFooter />
    </>
  );
}
