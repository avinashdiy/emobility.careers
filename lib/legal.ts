/**
 * Single source of truth for everything that appears on the four
 * public legal/info pages: /about, /privacy, /terms, /contact.
 *
 * REPLACE every value marked `TODO` below with the real registered
 * details before submitting the site for Razorpay/Stripe payment
 * gateway KYC, Google Business verification, or LinkedIn Page
 * verification. Reviewers cross-check these against the entity
 * documents you upload — mismatches are the #1 reason verifications
 * are rejected.
 */

export const LEGAL = {
  // ─── Identity ────────────────────────────────────────────────
  brand: "eMobility Careers",
  domain: "emobility.careers",
  legalName: "DIYguru Mobility Pvt. Ltd.",
  legalEntityType: "Private Limited Company",
  cin: "U35999DL2021PTC390357",
  // Startup India recognition — adds credibility on KYC / payment
  // gateway reviews. Optional to display, but most reviewers like
  // seeing it.
  dipp: "DIPP164561",
  gstin: "07AAICD9181A1ZP",
  pan: "AAICD9181A", // derived from GSTIN — the 10-char block in the middle is the PAN
  foundedYear: "2021", // derived from CIN year-segment "...2021PTC..."

  // ─── Addresses ───────────────────────────────────────────────
  // Registered office is what's on the MCA filing. Operational
  // office defaults to the same; update if they diverge.
  registeredOffice: {
    line1: "374, MG Road",
    line2: "",
    city: "New Delhi",
    state: "Delhi",
    pincode: "110030",
    country: "India",
  },
  operationalOffice: {
    line1: "374, MG Road",
    line2: "",
    city: "New Delhi",
    state: "Delhi",
    pincode: "110030",
    country: "India",
  },

  // ─── Contact ─────────────────────────────────────────────────
  // TODO Confirm or replace these email aliases. They must resolve to
  // a real inbox you actually monitor — Razorpay and Google bounce-test
  // the addresses during verification.
  emails: {
    support: "support@emobility.careers",
    grievance: "grievance@emobility.careers",
    privacy: "privacy@emobility.careers",
    business: "hello@emobility.careers",
  },
  phones: {
    support: "+91-9910918719",
    supportDisplay: "+91 99109 18719",
  },
  whatsapp: "+91-9910918719",
  hours: "Monday–Friday, 10:00–18:00 IST",

  // ─── Grievance officer (DPDP Act 2023, IT Rules 2021) ─────────
  // Required by Indian law to be a named individual at a real address.
  grievanceOfficer: {
    name: "Shivali Sharma",
    title: "Grievance Officer",
    email: "grievance@emobility.careers",
    phone: "+91-9910918719",
  },

  // ─── Founders (shown on /about) ───────────────────────────────
  founders: [
    { name: "Avinash Singh", role: "Founder & CEO" },
  ],

  // ─── Social ──────────────────────────────────────────────────
  social: {
    linkedin: "https://www.linkedin.com/company/emobility-careers",
    twitter: "https://twitter.com/emobilitycareer",
    instagram: "", // optional
    youtube: "",   // optional
  },
} as const;

// Convenience formatter — joins an address into a single inline string.
export function formatAddress(addr: typeof LEGAL.registeredOffice): string {
  return [addr.line1, addr.line2, `${addr.city}, ${addr.state} ${addr.pincode}`, addr.country]
    .filter((p) => p && !p.endsWith("(or empty)"))
    .join(", ");
}

// Last-updated date for the privacy/terms pages. Bump this whenever
// you materially change the policy text — both reviewers and end users
// expect the date to match the most recent revision.
export const LEGAL_LAST_UPDATED = "2026-04-30";
