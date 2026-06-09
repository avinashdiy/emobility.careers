import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/card";

export const runtime = "nodejs";
export const revalidate = 86400;
export const alt = "EV jobs in Australia on emobility.careers";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogCard({
    eyebrow: "EV Careers · Australia",
    title: "Where Australia's EV industry hires.",
    subtitle:
      "Battery, charging, motors and software roles from Sydney to Perth — find your next role or your next hire.",
    chips: ["Sydney", "Melbourne", "Brisbane", "Perth"],
    footerLeft: "EV jobs across Australia",
  });
}
