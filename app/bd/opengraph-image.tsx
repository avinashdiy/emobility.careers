import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/card";

export const runtime = "nodejs";
export const revalidate = 86400;
export const alt = "EV jobs in Bangladesh on emobility.careers";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogCard({
    eyebrow: "EV Careers · Bangladesh",
    title: "Where Bangladesh's EV industry hires.",
    subtitle:
      "Battery, charging and electric-mobility roles as Bangladesh builds its EV ecosystem.",
    chips: ["Dhaka", "Battery", "Charging", "Manufacturing"],
    footerLeft: "EV jobs across Bangladesh",
  });
}
