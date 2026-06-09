import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/card";

export const runtime = "nodejs";
export const revalidate = 86400;
export const alt = "EV Salary Compass on emobility.careers";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogCard({
    eyebrow: "Salary Compass",
    title: "What the EV industry actually pays.",
    subtitle:
      "Verified, anonymous salary submissions across engineers and technicians — see the medians before your next move.",
    chips: ["Engineers", "Technicians", "Verified data", "By role"],
    footerLeft: "Check a salary · Submit yours · Unlock the data",
  });
}
