import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import {
  CountryJobsListing,
  generateCountryJobsMetadata,
} from "@/components/jobs/CountryJobsListing";

// /ae/jobs — UAE-filtered jobs listing. Mirrors the wrapper pattern
// of every other country's jobs route; the shared component holds
// all the rendering logic so a copy / styling change updates all
// seven countries.

export const metadata: Metadata = generateCountryJobsMetadata("AE");

export default function UaeJobsRoute() {
  return (
    <>
      <SiteHeader />
      <CountryJobsListing country="AE" />
      <SiteFooter />
    </>
  );
}
