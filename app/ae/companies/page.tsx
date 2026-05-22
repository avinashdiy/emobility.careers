import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import {
  CountryCompaniesListing,
  generateCountryCompaniesMetadata,
} from "@/components/companies/CountryCompaniesListing";

// /ae/companies — UAE-filtered companies directory. Same wrapper
// pattern as /ae/jobs; all heavy lifting in the shared component.

export const metadata: Metadata = generateCountryCompaniesMetadata("AE");

export default function UaeCompaniesRoute() {
  return (
    <>
      <SiteHeader />
      <CountryCompaniesListing country="AE" />
      <SiteFooter />
    </>
  );
}
