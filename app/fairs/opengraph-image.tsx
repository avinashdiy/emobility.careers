import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/card";

export const runtime = "nodejs";
export const revalidate = 86400;
export const alt = "EV job fairs and Recruitathons on emobility.careers";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogCard({
    eyebrow: "EV Job Fairs",
    title: "Where careers happen, in person & online.",
    subtitle:
      "Multi-day Recruitathons bring top EV companies and serious candidates into one room — walk a booth or join from your laptop.",
    chips: ["Hybrid mode", "Live interviews", "On-the-spot offers"],
    footerLeft: "Find a fair · Register · Get hired",
  });
}
