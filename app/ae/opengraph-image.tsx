import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/card";

export const runtime = "nodejs";
export const revalidate = 86400;
export const alt = "EV jobs in the UAE on emobility.careers";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogCard({
    eyebrow: "EV Careers · UAE",
    title: "Where the UAE's EV industry hires.",
    subtitle:
      "Charging infrastructure, fleet electrification and EV manufacturing roles from Dubai to Abu Dhabi.",
    chips: ["Dubai", "Abu Dhabi", "Sharjah", "Charging"],
    footerLeft: "EV jobs across the UAE",
  });
}
