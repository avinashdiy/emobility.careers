import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import {
  CountryCompaniesListing,
  generateCountryCompaniesMetadata,
} from "@/components/companies/CountryCompaniesListing";

// /my/companies — Malaysia-filtered companies directory.

export const metadata: Metadata = generateCountryCompaniesMetadata("MY");

export default function MalaysiaCompaniesRoute() {
  return (
    <>
      <SiteHeader />
      <CountryCompaniesListing country="MY" />
      <SiteFooter />
    </>
  );
}
