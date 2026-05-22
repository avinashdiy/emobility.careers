import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import {
  CountryCompaniesListing,
  generateCountryCompaniesMetadata,
} from "@/components/companies/CountryCompaniesListing";

// /au/companies — Australia-filtered companies directory.

export const metadata: Metadata = generateCountryCompaniesMetadata("AU");

export default function AustraliaCompaniesRoute() {
  return (
    <>
      <SiteHeader />
      <CountryCompaniesListing country="AU" />
      <SiteFooter />
    </>
  );
}
