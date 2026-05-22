import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import {
  CountryJobsListing,
  generateCountryJobsMetadata,
} from "@/components/jobs/CountryJobsListing";

// /uk/jobs — UK-filtered jobs listing (Prisma enum value is GB;
// URL stays /uk for SEO clarity).

export const metadata: Metadata = generateCountryJobsMetadata("GB");

export default function UkJobsRoute() {
  return (
    <>
      <SiteHeader />
      <CountryJobsListing country="GB" />
      <SiteFooter />
    </>
  );
}
