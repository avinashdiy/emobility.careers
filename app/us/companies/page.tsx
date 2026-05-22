import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import {
  CountryCompaniesListing,
  generateCountryCompaniesMetadata,
} from "@/components/companies/CountryCompaniesListing";

// /us/companies — United States-filtered companies directory.

export const metadata: Metadata = generateCountryCompaniesMetadata("US");

export default function UsCompaniesRoute() {
  return (
    <>
      <SiteHeader />
      <CountryCompaniesListing country="US" />
      <SiteFooter />
    </>
  );
}
