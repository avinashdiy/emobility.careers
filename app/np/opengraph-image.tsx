import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/card";

export const runtime = "nodejs";
export const revalidate = 86400;
export const alt = "EV jobs in Nepal on emobility.careers";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogCard({
    eyebrow: "EV Careers · Nepal",
    title: "Where Nepal's EV industry hires.",
    subtitle:
      "Battery, charging and electric-mobility roles as Nepal accelerates its shift to EVs.",
    chips: ["Kathmandu", "Battery", "Charging", "Fleets"],
    footerLeft: "EV jobs across Nepal",
  });
}
