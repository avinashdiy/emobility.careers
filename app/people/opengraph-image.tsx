import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/card";

export const runtime = "nodejs";
export const revalidate = 86400;
export const alt = "Discover people in the EV industry on emobility.careers";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogCard({
    eyebrow: "EV Professionals",
    title: "The people moving electric mobility.",
    subtitle:
      "Engineers, technicians, founders and educators building India's and the world's EV industry.",
    chips: ["Engineers", "Technicians", "Founders", "Educators"],
    footerLeft: "Discover people · Connect · Hire",
  });
}
