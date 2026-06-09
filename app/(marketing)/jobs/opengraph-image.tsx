import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/card";

// Co-located OG image — merges into /jobs metadata even though the page
// defines its own openGraph (proven by /job/[slug]). Static (no DB) so
// it renders instantly and never times out WhatsApp's crawler.
export const runtime = "nodejs";
export const revalidate = 86400;
export const alt = "Latest EV jobs on emobility.careers";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogCard({
    eyebrow: "EV Jobs",
    title: "Every EV role, in one place.",
    subtitle:
      "Battery, charging, motors, vehicles and software jobs from the companies building electric mobility.",
    chips: ["Battery", "Charging", "Powertrain", "Software", "Manufacturing"],
    footerLeft: "Browse open roles · Get matched · Apply",
  });
}
