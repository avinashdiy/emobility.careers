import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import {
  CountryJobsListing,
  generateCountryJobsMetadata,
} from "@/components/jobs/CountryJobsListing";

// /bd/jobs — Bangladesh-filtered jobs listing.

export const metadata: Metadata = generateCountryJobsMetadata("BD");

export default function BangladeshJobsRoute() {
  return (
    <>
      <SiteHeader />
      <CountryJobsListing country="BD" />
      <SiteFooter />
    </>
  );
}
