import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/card";

export const runtime = "nodejs";
export const revalidate = 86400;
export const alt = "The EV industry feed on emobility.careers";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogCard({
    eyebrow: "Industry Feed",
    title: "What's happening in EV, right now.",
    subtitle:
      "Posts, launches, hires and insights from the people building electric mobility.",
    chips: ["Launches", "Hires", "Insights", "Discussion"],
    footerLeft: "Read the feed · Join the conversation",
  });
}
