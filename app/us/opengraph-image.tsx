import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/card";

export const runtime = "nodejs";
export const revalidate = 86400;
export const alt = "EV jobs in the US on emobility.careers";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogCard({
    eyebrow: "EV Careers · United States",
    title: "Where America's EV industry hires.",
    subtitle:
      "Battery cells, charging networks, powertrain and software roles from the SF Bay to Detroit.",
    chips: ["Bay Area", "Detroit", "Austin", "Boston"],
    footerLeft: "EV jobs across the US",
  });
}
