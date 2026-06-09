import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/card";

export const runtime = "nodejs";
export const revalidate = 86400;
export const alt = "Best EV Employers on emobility.careers";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogCard({
    eyebrow: "Best EV Employers",
    title: "The best places to build an EV career.",
    subtitle:
      "Recognising the EV companies that hire, grow and retain the industry's best talent.",
    chips: ["Top employers", "Culture", "Growth", "Hiring"],
    footerLeft: "See the winners · Get recognised",
  });
}
