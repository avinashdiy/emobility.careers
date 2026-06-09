import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/card";

export const runtime = "nodejs";
export const revalidate = 86400;
export const alt = "EV Career Explorer on emobility.careers";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogCard({
    eyebrow: "Career Explorer",
    title: "Map your path into the EV industry.",
    subtitle:
      "Explore roles, skills and salary bands across every corner of electric mobility — and see how to get there.",
    chips: ["Roles", "Skills", "Salaries", "Pathways"],
    footerLeft: "Explore careers · Plan your next move",
  });
}
