import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import {
  CountryCompaniesListing,
  generateCountryCompaniesMetadata,
} from "@/components/companies/CountryCompaniesListing";

// /bd/companies — Bangladesh-filtered companies directory.

export const metadata: Metadata = generateCountryCompaniesMetadata("BD");

export default function BangladeshCompaniesRoute() {
  return (
    <>
      <SiteHeader />
      <CountryCompaniesListing country="BD" />
      <SiteFooter />
    </>
  );
}
