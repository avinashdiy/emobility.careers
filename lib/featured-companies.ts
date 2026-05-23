import "server-only";

import { db } from "@/lib/db";

/**
 * Hand-curated hiring-partner gallery surfaced on the homepage.
 *
 * The source list + logo images come from the DIYguru WP media
 * library (footer.html "OEM Partners" section) — companies that
 * sit in the DIYguru/eMobility ecosystem and that we want to surface
 * on the careers homepage as a visual "this is the EV industry"
 * cue. Each entry has a `name` and a hotlinked `logoUrl`.
 *
 * `slug` is filled at render time by `getFeaturedPartnersWithSlugs()`
 * when a Company row with a matching `name` exists in the careers DB.
 * Filled → the gallery renders the logo as a `<Link href="/company/[slug]">`.
 * Unfilled → the logo renders as a non-clickable tile (the company
 * doesn't have a careers profile yet; the visual still works).
 *
 * Operational notes:
 *   - Image URLs hotlink `diyguru.org/wp-content/...`. If those URLs
 *     change or diyguru.org goes down, every logo on the homepage
 *     breaks at once. Follow-up: copy the logos into careers' MinIO
 *     (`emce-logos` bucket) and switch the base path here.
 *   - To add a partner: append to FEATURED_PARTNERS. If a Company row
 *     with the same exact `name` exists, it'll auto-link on next render.
 *   - To make a partner link to an existing Company row whose `name`
 *     doesn't match: rename the Company in the careers DB, or change
 *     the partner entry here to match the DB. Match is case-sensitive.
 */

const LOGO_BASE = "https://diyguru.org/wp-content/uploads/2025/12";

export interface FeaturedPartner {
  name: string;
  logoUrl: string;
  /// Filled by getFeaturedPartnersWithSlugs when a matching careers
  /// Company row exists; undefined → render as non-clickable tile.
  slug?: string;
}

export const FEATURED_PARTNERS: FeaturedPartner[] = [
  { name: "Hyundai", logoUrl: `${LOGO_BASE}/Hyundai-1.png` },
  { name: "Bosch", logoUrl: `${LOGO_BASE}/3.png` },
  { name: "Honda", logoUrl: `${LOGO_BASE}/5.png` },
  { name: "Maruti Suzuki", logoUrl: `${LOGO_BASE}/25.png` },
  { name: "Infineon", logoUrl: `${LOGO_BASE}/59.png` },
  { name: "ITL", logoUrl: `${LOGO_BASE}/48.png` },
  { name: "Rockman", logoUrl: `${LOGO_BASE}/60.png` },
  { name: "Nexzu", logoUrl: `${LOGO_BASE}/29.png` },
  { name: "BGauss", logoUrl: `${LOGO_BASE}/30.png` },
  { name: "Support Lines", logoUrl: `${LOGO_BASE}/47.png` },
  { name: "Kia Motors", logoUrl: `${LOGO_BASE}/45.png` },
  { name: "Ather Energy", logoUrl: `${LOGO_BASE}/31.png` },
  { name: "XBattery", logoUrl: `${LOGO_BASE}/32.png` },
  { name: "Revolt Energy", logoUrl: `${LOGO_BASE}/34.png` },
  { name: "Sonalika", logoUrl: `${LOGO_BASE}/33.png` },
  { name: "Yulu", logoUrl: `${LOGO_BASE}/35.png` },
  { name: "Inverted Energy", logoUrl: `${LOGO_BASE}/36.png` },
  { name: "Ola Electric", logoUrl: `${LOGO_BASE}/27.png` },
  { name: "Tata EV", logoUrl: `${LOGO_BASE}/28.png` },
  { name: "Ampere Electric Vehicles", logoUrl: `${LOGO_BASE}/55.png` },
  { name: "Daimler", logoUrl: `${LOGO_BASE}/43.png` },
  { name: "TCS", logoUrl: `${LOGO_BASE}/40.png` },
  { name: "John Deere", logoUrl: `${LOGO_BASE}/39.png` },
  { name: "L&T Energy", logoUrl: `${LOGO_BASE}/38.png` },
  { name: "Eaton", logoUrl: `${LOGO_BASE}/42.png` },
  { name: "WPG Holdings", logoUrl: `${LOGO_BASE}/53.png` },
  { name: "Kazam", logoUrl: `${LOGO_BASE}/52.png` },
  { name: "EVI Technologies", logoUrl: `${LOGO_BASE}/Logos-New-Website-1.png` },
  { name: "Tadpole", logoUrl: `${LOGO_BASE}/17-1.png` },
  { name: "Junphenix Energy", logoUrl: `${LOGO_BASE}/51.png` },
  { name: "Komaki EV", logoUrl: `${LOGO_BASE}/50.png` },
  { name: "Midwest Energy", logoUrl: `${LOGO_BASE}/49.png` },
  { name: "iXEnergy", logoUrl: `${LOGO_BASE}/46.png` },
  { name: "Simple Energy", logoUrl: `${LOGO_BASE}/58.png` },
  { name: "HL Mando", logoUrl: `${LOGO_BASE}/44.png` },
];

/**
 * Resolve FEATURED_PARTNERS to a slug-enriched array.
 *
 * One DB round-trip — `name IN (...)` against the Company table. Returns
 * the FEATURED_PARTNERS list in its original order, with `slug` set on
 * any entry whose name matched a Company row (case-sensitive). Unmatched
 * entries come back with `slug` undefined.
 */
export async function getFeaturedPartnersWithSlugs(): Promise<FeaturedPartner[]> {
  const names = FEATURED_PARTNERS.map((p) => p.name);
  const matches = await db.company.findMany({
    where: { name: { in: names } },
    select: { name: true, slug: true },
  });
  const slugByName = new Map(matches.map((c) => [c.name, c.slug]));
  return FEATURED_PARTNERS.map((p) => {
    const slug = slugByName.get(p.name);
    return slug ? { ...p, slug } : p;
  });
}
