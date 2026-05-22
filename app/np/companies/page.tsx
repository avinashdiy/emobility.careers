import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import {
  CountryCompaniesListing,
  generateCountryCompaniesMetadata,
} from "@/components/companies/CountryCompaniesListing";

// /np/companies — Nepal-filtered companies directory.

export const metadata: Metadata = generateCountryCompaniesMetadata("NP");

export default function NepalCompaniesRoute() {
  return (
    <>
      <SiteHeader />
      <CountryCompaniesListing country="NP" />
      <SiteFooter />
    </>
  );
}
