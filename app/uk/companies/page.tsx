import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import {
  CountryCompaniesListing,
  generateCountryCompaniesMetadata,
} from "@/components/companies/CountryCompaniesListing";

// /uk/companies — UK-filtered companies directory (Prisma enum GB).

export const metadata: Metadata = generateCountryCompaniesMetadata("GB");

export default function UkCompaniesRoute() {
  return (
    <>
      <SiteHeader />
      <CountryCompaniesListing country="GB" />
      <SiteFooter />
    </>
  );
}
