import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/card";

export const runtime = "nodejs";
export const revalidate = 86400;
export const alt = "EV jobs in the UK on emobility.careers";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogCard({
    eyebrow: "EV Careers · United Kingdom",
    title: "Where the UK's EV industry hires.",
    subtitle:
      "Powertrain, battery research, charging networks and EV manufacturing roles from London to Sunderland.",
    chips: ["London", "Coventry", "Manchester", "Sunderland"],
    footerLeft: "EV jobs across the UK",
  });
}
