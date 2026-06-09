import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/card";

export const runtime = "nodejs";
export const revalidate = 86400;
export const alt = "Roast my resume — free AI CV scoring on emobility.careers";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogCard({
    eyebrow: "Resume Roast",
    title: "Get your EV resume roasted — free.",
    subtitle:
      "Honest, AI-powered scoring across the things EV recruiters actually look for. No sign-up to try.",
    chips: ["Free", "AI-scored", "EV-specific", "Instant"],
    footerLeft: "Upload your CV · Get your score",
  });
}
